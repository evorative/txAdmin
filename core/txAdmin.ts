import fs from 'node:fs';
import path from 'node:path';
import slash from 'slash';

import { EvoEnv } from '@core/globalData';

import { printBanner } from '@core/extras/banner';
import setupProfile from '@core/extras/setupProfile';
import updateChecker from '@core/extras/updateChecker';

import AdminVault from '@core/components/AdminVault';
import ConfigVault from '@core/components/ConfigVault';
import DiscordBot from '@core/components/DiscordBot';
import DynamicAds from '@core/components/DynamicAds';
import FxRunner from '@core/components/FxRunner';
import Logger from '@core/components/Logger';
import HealthMonitor from '@core/components/HealthMonitor';
import Scheduler from '@core/components/Scheduler';
import StatisticsManager from '@core/components/StatisticsManager';
import PerformanceCollector from '@core/components/PerformanceCollector';
import Translator from '@core/components/Translator';
import WebServer from '@core/components/WebServer';
import ResourcesManager from '@core/components/ResourcesManager';
import PlayerlistManager from '@core/components/PlayerlistManager';
import PlayerDatabase from '@core/components/PlayerDatabase';
import PersistentCache from '@core/components/PersistentCache';
import UpdateChecker from '@core/components/UpdateChecker';

import consoleFactory from '@extras/console';
const console = consoleFactory(`v${EvoEnv.EvorativeVersion}`);


//Helpers
const cleanPath = (x: string) => { return slash(path.normalize(x)); };


// Long ago I wanted to replace this with dependency injection.
// I Totally gave up.
const globalsInternal: Record<string, any> = {
    txAdmin: null, //self reference for webroutes that need to access it from the globals

    adminVault: null,
    discordBot: null,
    fxRunner: null,
    logger: null,
    dynamicAds: null,
    healthMonitor: null,
    scheduler: null,
    statisticsManager: null,
    performanceCollector: null,
    translator: null,
    webServer: null,
    resourcesManager: null,
    playerlistManager: null,
    playerDatabase: null,
    config: null,
    deployer: null,
    updateChecker: null,
    info: {},

    //FIXME: settings:save webroute cannot call txAdmin.refreshConfig for now
    //so this hack allows it to call it
    func_txAdminRefreshConfig: ()=>{},
};

//@ts-ignore: yes i know this is wrong
global.globals = globalsInternal;


/**
 * Main APP
 */
export default class TxAdmin {
    configVault;
    adminVault;
    discordBot;
    logger;
    translator;
    fxRunner;
    dynamicAds;
    healthMonitor;
    scheduler;
    statisticsManager;
    performanceCollector;
    webServer;
    resourcesManager;
    playerlistManager;
    playerDatabase;
    persistentCache;
    updateChecker;

    //Runtime
    readonly info: {
        serverProfile: string;
        serverProfilePath: string;
    }
    globalConfig: {
        serverName: string,
        language: string,
        menuEnabled: boolean,
        menuAlignRight: boolean,
        menuPageKey: string,

        hideDefaultAnnouncement: boolean,
        hideDefaultDirectMessage: boolean,
        hideDefaultWarning: boolean,
        hideDefaultScheduledRestartWarning: boolean,
    }
    

    constructor(serverProfile: string) {
        console.log(`Profile '${serverProfile}' starting...`);

        //FIXME: hacky self reference because some webroutes need to access globals.txAdmin to pass it down
        globalsInternal.txAdmin = this;

        //Check if the profile exists and call setup if it doesn't
        const profilePath = cleanPath(path.join(EvoEnv.dataPath, serverProfile));
        if (!fs.existsSync(profilePath)) {
            try {
                setupProfile(EvoEnv.osType, EvoEnv.fxServerPath, EvoEnv.fxServerVersion, serverProfile, profilePath);
            } catch (error) {
                console.error(`Failed to create profile '${serverProfile}' with error: ${(error as Error).message}`);
                process.exit();
            }
        }
        this.info = {
            serverProfile: serverProfile,
            serverProfilePath: profilePath
        }
        globalsInternal.info = this.info;

        //Load Config Vault
        let profileConfig;
        try {
            this.configVault = new ConfigVault(profilePath, serverProfile);
            globalsInternal.configVault = this.configVault;
            profileConfig = globalsInternal.configVault.getAll();
            this.globalConfig = profileConfig.global;
            globalsInternal.config = this.globalConfig;

            //FIXME: hacky fix for settings:save to be able to update this
            globalsInternal.func_txAdminRefreshConfig = this.refreshConfig.bind(this);
        } catch (error) {
            console.error(`Error starting ConfigVault:`);
            console.dir(error);
            process.exit(1);
        }

        //Start all modules
        //NOTE: dependency order
        //  - translator before fxrunner (for the locale string)
        //  - translator before scheduler (in case it tries to send translated msg immediately)
        //  - adminVault before webserver
        //  - logger before fxrunner
        //FIXME: After the migration, delete the globalsInternal.
        try {
            this.adminVault = new AdminVault();
            globalsInternal.adminVault = this.adminVault;

            this.discordBot = new DiscordBot(this, profileConfig.discordBot);
            globalsInternal.discordBot = this.discordBot;

            this.logger = new Logger(profileConfig.logger);
            globalsInternal.logger = this.logger;

            this.translator = new Translator();
            globalsInternal.translator = this.translator;

            this.fxRunner = new FxRunner(this, profileConfig.fxRunner);
            globalsInternal.fxRunner = this.fxRunner;

            this.dynamicAds = new DynamicAds();
            globalsInternal.dynamicAds = this.dynamicAds;

            this.healthMonitor = new HealthMonitor(profileConfig.monitor);
            globalsInternal.healthMonitor = this.healthMonitor;

            this.scheduler = new Scheduler(profileConfig.monitor); //NOTE same opts as monitor, for now
            globalsInternal.scheduler = this.scheduler;

            this.statisticsManager = new StatisticsManager(this);
            globalsInternal.statisticsManager = this.statisticsManager;

            this.performanceCollector = new PerformanceCollector();
            globalsInternal.performanceCollector = this.performanceCollector;

            this.webServer = new WebServer(this, profileConfig.webServer);
            globalsInternal.webServer = this.webServer;

            this.resourcesManager = new ResourcesManager();
            globalsInternal.resourcesManager = this.resourcesManager;

            this.playerlistManager = new PlayerlistManager(this);
            globalsInternal.playerlistManager = this.playerlistManager;

            this.playerDatabase = new PlayerDatabase(this, profileConfig.playerDatabase);
            globalsInternal.playerDatabase = this.playerDatabase;

            this.persistentCache = new PersistentCache(this);
            globalsInternal.persistentCache = this.persistentCache;

            this.updateChecker = new UpdateChecker();
            globalsInternal.updateChecker = this.updateChecker;
        } catch (error) {
            console.error(`Error starting main components:`);
            console.dir(error);
            process.exit(1);
        }

        //Once they all finish loading, the function below will print the banner
        try {
            printBanner();
        } catch (error) {
            console.dir(error);
        }
    }

    /**
     * Refreshes the global config
     */
    refreshConfig() {
        this.globalConfig = this.configVault.getScoped('global');
        globalsInternal.config = this.globalConfig;
    }
};
