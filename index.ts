import { ConfigType, InputType, TeeInfo, WatchList } from './types';
import syncFetch from 'sync-fetch';
import nodeConfig from 'config';
import nodemailer from 'nodemailer';
import mg from 'nodemailer-mailgun-transport';
import moment from 'moment';
import promptSync from 'prompt-sync';
const prompt = promptSync();

const config = nodeConfig.get('config') as ConfigType;
const input = nodeConfig.get('input') as InputType;

console.log('NODE_ENV:', process.env.NODE_ENV, '\n');
console.log('Config:', JSON.stringify(config, null, 2), '\n');
console.log('Input:', JSON.stringify(input, null, 2), '\n');

prompt('Press enter to continue...');

async function sendNotificationEmailAsync(date: string, time: string, teeInfo: TeeInfo) {
    const nodemailerMailgun = nodemailer.createTransport(mg(config.mailgunAuth));

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
        <p><b>${input.spotsRequired}</b> spots are now available for booking at <b>${formattedDateTime}</b>.</p>
        <br/>
        <p>${participantsMarkup}</p>
    `;

    nodemailerMailgun.sendMail({
        ...config.notificationEmails,
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
    const formTokenRegex = /name="login_form\[_token\]" value="(.*)"/
    const sessionRegex = /(PHPSESSID=[0-9a-f]+;)/
    const loginPage = syncFetch(`${config.baseUrl}/login`);
    const formToken = loginPage.text().match(formTokenRegex)[1];
    const sessionIdCookie = loginPage.headers.get('set-cookie').match(sessionRegex)[1];

    const postResponse = syncFetch(`${config.baseUrl}/login`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            cookie: loginPage.headers.get('set-cookie')
        },
        body: new URLSearchParams({
            'login_form[username]': config.brsGolfCredentials.username,
            'login_form[password]': config.brsGolfCredentials.password,
            'login_form[_token]': formToken
        }),
    });

    const postAuthCookies = postResponse.headers.get('set-cookie');
    authCookies = sessionIdCookie + postAuthCookies;
    lastLogin = new Date().getTime();
}

function pollAndUpdate(): boolean {
    if (new Date().getTime() - lastLogin > config.loginInterval) {
        logIn();
    }

    console.log('Polling...');

    const nextWatchList = [] as WatchList;

    watchList.forEach(dateTimes => {
        const date = dateTimes.date;
        console.log(`\tDate: ${date}`);

        const epochMs = new Date().getTime();
        const teeSheetUrl = `${config.baseUrl}/tee-sheet/data/1/${date}?_=${epochMs}`;
        const response = syncFetch(teeSheetUrl, { headers: { cookie: authCookies } }).json();

        const remainingTimes = dateTimes.times.filter(time => {
            console.log(`\t\tTime: ${time}`)

            const sheetTimes = response.times;
            const teeInfo: TeeInfo = sheetTimes[time]['tee_time'];
            const numParticipants = teeInfo.participants.length;
            const numUnnamedParticipants = teeInfo.participants.filter(p => p.name === null).length;
            const isSuitable = teeInfo.bookable && (numParticipants === 0 || numUnnamedParticipants >= input.spotsRequired);

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

    watchList = nextWatchList;
    return false;
}

console.log('Starting...')
logIn();
let watchList = input.watchList;
let shouldExit = pollAndUpdate();
if (!shouldExit) {
    const clearPollInterval = setInterval(() => {
        shouldExit = pollAndUpdate();
        if (shouldExit) {
            console.log('Received signal to exit, waiting for things to finish...');
            clearInterval(clearPollInterval);
        }
    }, config.pollInterval)
} else {
    console.log('Received signal to exit, waiting for things to finish...');
}
