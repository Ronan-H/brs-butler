import fetch from 'sync-fetch';
import config from 'config';
const cookie = config.get('auth.cookie');
const baseTeeSheetUrl = config.get('baseTeeSheetUrl');
const pollInterval = config.get('pollInterval');

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
const spotsRequired = 2;

console.log('Starting...')

function pollAndUpdate() {
    console.log('Polling...');

    const nextWatchList = [] as WatchList;

    watchlist.forEach(dateTimes => {
        console.log(`\tDate: ${dateTimes.date}`);

        const epochMs = new Date().getTime();
        const url = `${baseTeeSheetUrl}${dateTimes.date}?_=${epochMs}`;
        const response = fetch(url, { headers: { cookie } }).json();

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
const clearInterval = setInterval(() => {
    pollAndUpdate();
}, pollInterval)
