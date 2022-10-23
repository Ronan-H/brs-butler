
# BRS Butler

A simple script to poll BRS Golf tee sheets, and notify of any cancellations.

## How it Works
- Setup a mailgun account (if you want email notifications).
- Add a filter in your inbox to prevent your emails from being marked as spam.
- Pick the dates and times you are interested in booking.
- If any of the times become available, you will receive an email with info about the time slot.

## Features
- Headless authentication and token refresh mechanism.
- HTML formatted notification emails.
- Detailed output during each poll.

## Configuration

Some configuration is required. Format:

*/config/default.json*

```json
{
    "config": {
        "mailgunAuth": {
            "auth": {
                "api_key": "(YOUR MAILGUN API KEY)",
                "domain": "(YOUR MAILGUN DOMAIN)"
            }
        },
        "baseUrl": "https://members.brsgolf.com/(YOUR CLUB NAME)",
        "brsGolfCredentials": {
            "username": "(YOUR BRS GOLF USERNAME)",
            "password": "(YOUR BRS GOLF PASSWORD)"
        },
        "notificationEmails": {
            "from": "(YOUR FROM ADDRESS)",
            "to": [
                "(YOUR RECIPIENT ADDRESSES)"
            ],
            "cc": "(YOUR CC ADDRESSES)"
        },
        "pollInterval": 30000,
        "loginInterval": 300000,
        "debug": false
    },
    "input": {
        "spotsRequired": 2,
        "watchList": [
            {
                "date": "2022/10/23",
                "times": [
                    "10:20",
                    "10:30",
                    "10:40",
                    "10:50",
                    "11:00",
                    "11:10",
                    "11:20",
                    "11:30"
                ]
            }
        ]
    }
}
```

More about `config`: https://www.npmjs.com/package/config

## Installation

[NPM / Node.js](https://nodejs.org/en/download/) is required.

To install and run the script:

```sh
git clone https://github.com/Ronan-H/brs-butler.git
cd brs-butler
npm install
npm start
```

**Important:**
- I can't guarantee this will actually work *out of the box* for every golf club, some tweaking may be required.
- I haven't tested this across multiple dates yet.
- Keep the login/polling rates reasonable to avoid putting unnecessary strain on BRS Golf (and who knows, you could start getting rate limited, or even banned).
