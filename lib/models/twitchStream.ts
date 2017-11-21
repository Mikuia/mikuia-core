import {TwitchChannel} from './twitchChannel';

export interface TwitchStream {
    _id: number,
    game: string,
    viewers: number,
    video_height: number,
    average_fps: number,
    delay: number,
    created_at: string,
    is_playlist: boolean,
    preview: {
        small: string,
        medium: string,
        large: string,
        template: string
    },
    channel: TwitchChannel,
    _links: {
        self: string
    }
}