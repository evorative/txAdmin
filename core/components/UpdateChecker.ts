const modulename = 'UpdateChecker';
import semver from 'semver';
import { z } from "zod";
import got from '@core/extras/got.js';
import { EvoEnv } from '@core/globalData';
import consoleFactory from '@extras/console';
import { convars } from '@core/globalData';
const console = consoleFactory(modulename);


type txUpdateDataType = {
    semverDiff: semver.ReleaseType | null;
    latest: string;
    color: 'info' | 'secondary' | 'success' | 'warning' | 'danger';
};

type fxsUpdateDataType = {
    color: 'info' | 'secondary' | 'success' | 'warning' | 'danger';
    message: string;
    subtext: string;
    downloadLink: string;
};

const txVersion = z.string().refine(
    (x) => x !== '0.0.0',
    { message: 'must not be 0.0.0' }
);
const changelogRespSchema = z.object({
    recommended: z.coerce.number().positive(),
    recommended_download: z.string().url(),
    recommended_txadmin: txVersion,
    optional: z.coerce.number().positive(),
    optional_download: z.string().url(),
    optional_txadmin: txVersion,
    latest: z.coerce.number().positive(),
    latest_download: z.string().url(),
    latest_txadmin: txVersion,
    critical: z.coerce.number().positive(),
    critical_download: z.string().url(),
    critical_txadmin: txVersion,
});



export default class UpdateChecker {
    txUpdateData?: txUpdateDataType;
    fxsUpdateData?: fxsUpdateDataType;

    constructor() {
        //Check for updates ASAP
        this.checkChangelog();

        //Check again every 15 mins
        setInterval(() => {
            this.checkChangelog();
        }, 15 * 60_000);
    }


    /**
     * Check for txAdmin and FXServer updates
     */
    async checkChangelog() {
        //GET changelog data
        let apiResponse: z.infer<typeof changelogRespSchema>;
        try {
            //perform request - cache busting every ~1.4h
            const osTypeApiUrl = (EvoEnv.isWindows) ? 'win32' : 'linux';
            const cacheBuster = Math.floor(Date.now() / 5_000_000);
            const reqUrl = `https://changelogs-live.fivem.net/api/changelog/versions/${osTypeApiUrl}/server?${cacheBuster}`;
            const resp = await got(reqUrl).json()
            apiResponse = changelogRespSchema.parse(resp);
        } catch (error) {
            console.verbose.warn(`Failed to retrieve FXServer/txAdmin update data with error: ${error.message}`);
            return;
        }

        //Checking Evorative version
        try {
            const isOutdated = semver.lt(apiResponse.latest_txadmin, EvoEnv.EvorativeVersion);
            if (isOutdated) {
                const semverDiff = semver.diff(apiResponse.latest_txadmin, EvoEnv.EvorativeVersion);
                if (semverDiff === 'patch') {
                    console.warn('This version of txAdmin is outdated.');
                    console.warn('A patch (bug fix) update is available for txAdmin.');
                    console.warn('If you are experiencing any kind of issue, please update now.');
                    console.warn('For more information: https://discord.gg/uAmsGa2');
                    this.txUpdateData = {
                        semverDiff,
                        latest: EvoEnv.EvorativeVersion,
                        color: 'secondary',
                    };
                } else {
                    console.error('This version of txAdmin is outdated.');
                    console.error('Please update as soon as possible.');
                    console.error('For more information: https://discord.gg/uAmsGa2');
                    this.txUpdateData = {
                        semverDiff,
                        latest: EvoEnv.EvorativeVersion,
                        color: 'danger',
                    };
                }
            }
        } catch (error) {
            console.verbose.warn('Error checking for txAdmin updates. Enable verbosity for more information.');
            console.verbose.dir(error);
        }

        //Checking FXServer version
        //TODO: logic copied from dashboard webroute, adapt to new thing
        try {
            if (EvoEnv.fxServerVersion < apiResponse.critical) {
                const shouldUpdate = {
                    color: 'danger',
                    message: 'A critical update is available for FXServer, you should update now.',
                } as const;
                if (apiResponse.critical > apiResponse.recommended) {
                    this.fxsUpdateData = {
                        ...shouldUpdate,
                        subtext: `critical update ${EvoEnv.fxServerVersion} ➤ ${apiResponse.critical}`,
                        downloadLink: apiResponse.critical_download,
                    }
                } else {
                    this.fxsUpdateData = {
                        ...shouldUpdate,
                        subtext: `recommended update ${EvoEnv.fxServerVersion} ➤ ${apiResponse.recommended}`,
                        downloadLink: apiResponse.recommended_download,
                    }
                }
            } else if (EvoEnv.fxServerVersion < apiResponse.recommended) {
                this.fxsUpdateData = {
                    color: 'warning',
                    message: 'A recommended update is available for FXServer, you should update.',
                    subtext: `recommended update ${EvoEnv.fxServerVersion} ➤ ${apiResponse.recommended}`,
                    downloadLink: apiResponse.recommended_download,
                };
            } else if (EvoEnv.fxServerVersion < apiResponse.optional) {
                this.fxsUpdateData = {
                    color: 'info',
                    message: 'An optional update is available for FXServer.',
                    subtext: `optional update ${EvoEnv.fxServerVersion} ➤ ${apiResponse.optional}`,
                    downloadLink: apiResponse.optional_download,
                };
            }
        } catch (error) {
            console.warn('Error checking for FXServer updates. Enable verbosity for more information.');
            console.verbose.dir(error);
        }
    }
};

/*
    TODO:
    Create an page with the changelog, that queries for the following endpoint and caches it for 15 minutes:
        https://changelogs-live.fivem.net/api/changelog/versions/2385/2375?tag=server
    Maybe even grab the data from commits:
        https://changelogs-live.fivem.net/api/changelog/versions/5562
    Other relevant apis:
        https://changelogs-live.fivem.net/api/changelog/versions/win32/server? (the one being used below)
        https://changelogs-live.fivem.net/api/changelog/versions
        https://api.github.com/repos/tabarra/txAdmin/releases (changelog in [].body)

    NOTE: old logic
    if == recommended, you're fine
    if > recommended && < optional, pls update to optional
    if == optional, you're fine
    if > optional && < latest, pls update to latest
    if == latest, duh
    if < critical, BIG WARNING
*/
