import syncFetch from 'sync-fetch';
import config from 'config';

const credentials = config.get('credentials') as { username: string, password: string };
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

let watchlist = [
    {
        date: '2022/10/15',
        times: [
            '13:10',
            '13:20',
            '13:50'
        ]
    }
] as WatchList;

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

function pollAndUpdate() {
    if (new Date().getTime() - lastLogin > loginInterval) {
        logIn();
    }

    console.log('Polling...');

    const nextWatchList = [] as WatchList;

    watchlist.forEach(dateTimes => {
        console.log(`\tDate: ${dateTimes.date}`);

        const epochMs = new Date().getTime();
        const teeSheetUrl = `${baseUrl}/tee-sheet/data/1/${dateTimes.date}?_=${epochMs}`;
        const response = syncFetch(teeSheetUrl, { headers: { cookie: authCookies } }).json();

        const remainingTimes = dateTimes.times.filter(time => {
            console.log(`\t\tTime: ${time}`)

            const sheetTimes = response.times;
            const freeSpots = sheetTimes[time]['tee_time'].participants.filter(p => p.name === null).length;
            const isSuitable = freeSpots >= spotsRequired || time === '13:20';

            console.log(`\t\t\tFree spots: ${freeSpots}. Suitable: ${isSuitable}`);

            if (isSuitable) {
                console.log('\t\t\t<< Found a bookable tee time! >>');
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
        console.log('Watchlist is now empty. Exiting...')
        process.exit();
    }

    watchlist = nextWatchList;
}

pollAndUpdate();
const clearPollInterval = setInterval(() => {
    pollAndUpdate();
}, pollInterval)
