import * as cli from 'cli-color';
import * as moment from 'moment';

export class Log {
    static log(category: string, message: string, status: string, color: cli.Format) {
        console.log(cli.whiteBright(moment().format('HH:mm:ss')) + ' [' + color(status) + '] ' + category + ' / ' + cli.whiteBright(message));
    }

    static success(category: string, message: string) {
        this.log(category, message, 'Success', cli.greenBright);
    }

    static info(category: string, message: string) {
        this.log(category, message, 'Info', cli.whiteBright);
    }

    static warning(category: string, message: string) {
        this.log(category, message, 'Warning', cli.yellowBright);
    }

    static error(category: string, message: string) {
        this.log(category, message, 'Error', cli.redBright);
    }

    static fatal(category: string, message: string) {
        this.log(category, message, 'Fatal', cli.red);
        process.exit(1);
    }
}