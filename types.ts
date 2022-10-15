
export type ConfigType = {
    baseUrl: string
    brsGolfCredentials: {
        username: string
        password: string
    },
    mailgunAuth: {
        auth: {
            api_key: string
            domain: string
        }
    },
    notificationEmails: {
        from: string
        to: [
            string
        ]
    },
    pollInterval: number
    loginInterval: number
};

export type InputType = {
    spotsRequired: number
    watchList: WatchList
}

export type WatchList = {
    date: string;
    times: string[];
}[];

export type TeeInfo = {
    reservation: string
    reservation_type: string
    reservation_colour: string
    booked: boolean
    holes: number
    participants: Participant[]
    bookable: boolean
    editable: boolean
    reason: string
    detail: string
    unavailable_label: string
    buggies_remaining: number | null
    url: string | null
};

export type Participant = {
    name: string
    has_buggy: boolean
    is_buddy: boolean
};
