import syncFetch from 'sync-fetch';
import config from 'config';
import nodemailer from 'nodemailer';
import mg from 'nodemailer-mailgun-transport';
import moment from 'moment';

const credentials = config.get('credentials') as { username: string, password: string };
const mailgunAuth = config.get('mailgunAuth');
const notificationEmailFrom = config.get('notificationEmails.from') as string;
const notificationEmailsTo = config.get('notificationEmails.to') as string | string[];
let notificationEmailCc;
if (config.has('notificationEmails.cc')) {
    notificationEmailCc = config.get('notificationEmails.cc') as string;
}
const baseUrl = config.get('baseUrl') as string;
const pollInterval = config.get('pollInterval') as number;
const loginInterval = config.get('loginInterval') as number;
const spotsRequired = config.get('spotsRequired') as number;

const formTokenRegex = /name="login_form\[_token\]" value="(.*)"/
const sessionRegex = /(PHPSESSID=[0-9a-f]+;)/

type WatchList = {
    date: string;
    times: string[];
}[];

type Participant = {
    name: string,
    has_buggy: boolean,
    is_buddy: boolean
};

type TeeInfo = {
    reservation: string,
    reservation_type: string,
    reservation_colour: string,
    booked: boolean,
    holes: number,
    participants: Participant[],
    bookable: boolean,
    editable: boolean,
    reason: string,
    detail: string,
    unavailable_label: string,
    buggies_remaining: number | null,
    url: string | null
};

let watchlist = [
    {
        date: '2022/10/16',
        times: [
            '10:00',
            '10:10',
            '10:20',
            '10:30',
            '10:40',
            '10:50',
            '11:00',
            '11:10',
            '11:20',
            '11:30',
        ]
    }
] as WatchList;

async function sendNotificationEmailAsync(date: string, time: string, teeInfo: TeeInfo) {
    const nodemailerMailgun = nodemailer.createTransport(mg(mailgunAuth));

    const formattedDateTime = moment(`${date} ${time}`, "YYYY/MM/DD HH:mm").format('h:mm A [on] dddd, MMM Do');
    const subject = `Tee time now available: ${formattedDateTime}`
    const participants = teeInfo.participants;
    const participantsList = participants.filter(p => p.name).map(p => p.name).join(', ');
    const participantsMarkup = participantsList ?
        `<i>Other participants currently still booked for this time: <b>${participantsList}</b>.</i>`
        :
        '<i>This tee currently has no other participants booked.</i>'

    const html = `
        <h2>Tee time now available!</h2>
        <p>One of the tee times you had your eye on is now available for booking!</p>
        <p><b>${spotsRequired}</b> spots are now available for booking at <b>${formattedDateTime}</b>.</p>
        <br/>
        <p>${participantsMarkup}</p>
    `;

    nodemailerMailgun.sendMail({
        from: notificationEmailFrom,
        to: notificationEmailsTo,
        cc: notificationEmailCc,
        subject,
        html,
    }, (err, _info) => {
        if (err) {
            console.error(`Error occured while trying to send notification email:`);
            console.error(JSON.stringify(err));
            process.exit(1);
        }
        else {
            console.log(`Notification email sent successfully.`);
        }
    });
}

console.log('Starting...')

let authCookies: string;
let lastLogin: number;
function logIn() {
    if (authCookies) {
        console.log('Refreshing auth cookies...');
    }
    else {
        console.log('Logging in...');
    }

    // To log in successfully, we seem to need a corresponding PHPSESSID and login form token pair,
    // so we need to fetch the login page first and store those details.
    const loginPage = syncFetch(`${baseUrl}/login`);
    const formToken = loginPage.text().match(formTokenRegex)[1];
    const sessionIdCookie = loginPage.headers.get('set-cookie').match(sessionRegex)[1];

    const postResponse = syncFetch(`${baseUrl}/login`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            cookie: loginPage.headers.get('set-cookie')
        },
        body: new URLSearchParams({
            'login_form[username]': credentials.username,
            'login_form[password]': credentials.password,
            'login_form[_token]': formToken
        }),
    });

    const postAuthCookies = postResponse.headers.get('set-cookie');
    authCookies = sessionIdCookie + postAuthCookies;
    lastLogin = new Date().getTime();
}
logIn();

function pollAndUpdate(): boolean {
    if (new Date().getTime() - lastLogin > loginInterval) {
        logIn();
    }

    console.log('Polling...');

    const nextWatchList = [] as WatchList;

    watchlist.forEach(dateTimes => {
        const date = dateTimes.date;
        console.log(`\tDate: ${date}`);

        const epochMs = new Date().getTime();
        const teeSheetUrl = `${baseUrl}/tee-sheet/data/1/${date}?_=${epochMs}`;
        const response = syncFetch(teeSheetUrl, { headers: { cookie: authCookies } }).json();

        const remainingTimes = dateTimes.times.filter(time => {
            console.log(`\t\tTime: ${time}`)

            const sheetTimes = response.times;
            const teeInfo: TeeInfo = sheetTimes[time]['tee_time'];
            const numParticipants = teeInfo.participants.length;
            const numUnnamedParticipants = teeInfo.participants.filter(p => p.name === null).length;
            const isSuitable = teeInfo.bookable && (numParticipants === 0 || numUnnamedParticipants >= spotsRequired);

            console.log(`\t\t\tBookable: ${teeInfo.bookable}`);
            console.log(`\t\t\tNum. Participants: ${numParticipants}`);
            console.log(`\t\t\tFree spots: ${numUnnamedParticipants}`);
            console.log(`\t\t\tSuitable: ${isSuitable}`);

            if (isSuitable) {
                console.log('\t\t\t<< Found a bookable tee time! Sending notification email async... >>');
                sendNotificationEmailAsync(date, time, sheetTimes[time]['tee_time']);
                return false; // Filter out this time.
            } else {
                return true;
            }
        });

        if (remainingTimes.length > 0) {
            nextWatchList.push({
                ...dateTimes,
                times: remainingTimes
            });
        }
    });

    if (nextWatchList.length === 0) {
        console.log('Watchlist is now empty.');
        return true;
    }

    watchlist = nextWatchList;
    return false;
}

let shouldExit = pollAndUpdate();
if (!shouldExit) {
    const clearPollInterval = setInterval(() => {
        shouldExit = pollAndUpdate();
        if (shouldExit) {
            console.log('Received signal to exit, waiting for things to finish...');
            clearInterval(clearPollInterval);
        }
    }, pollInterval)
} else {
    console.log('Received signal to exit, waiting for things to finish...');
}
