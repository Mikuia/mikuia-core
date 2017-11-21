export class Tools {
    static chunkArray<T>(array: Array<T>, size: number): Array<Array<T>> {
        var R: Array<any> = [];
        var a = array.slice(0);
        while(a.length > 0) {
            R.push(a.splice(0, size));
        }
        return R;
    }

    static extend(defaults: Object, options: Object) {
        var extended = {};

        for(let prop in defaults) {
            if(Object.prototype.hasOwnProperty.call(defaults, prop)) {
                extended[prop] = defaults[prop];
            }
        }

        for(let prop in options) {
            if(Object.prototype.hasOwnProperty.call(options, prop)) {
                extended[prop] = options[prop];
            }
        }
        
        return extended;
    }

    static sleep(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        })
    }
}