define(['events', 'appSettings', 'pluginManager', 'packageManager', 'shell', 'filesystem'], function (Events, appSettings, pluginManager, packageManager, shell, fileSystem) {
    "use strict";

    return function () {
        packageManager.uninstall('External Player');
        var self = this;
        self.name = 'Application';
        self.type = 'mediaplayer';
        self.id = 'application';

        // Prioritize first
        self.priority = -99;
        self.supportsProgress = false;
        self.isLocalPlayer = true;

        var currentProcess;

        var currentSrc;
        var games;
       

        self.canPlayMediaType = function (mediaType) {
            return true;
        };

        self.canPlayItem = function (item, playOptions) {
            //console.log(item);
            if (item.MediaType === 'Video' && !playOptions.fullscreen) {
                return false;
            }
            var options = {
                mediaType: item.MediaType,
                videoType: item.VideoType,
                gameSystem: item.GameSystem,
                gameName: item.Name,
                protocol: item.LocationType === 'Remote' || item.LocationType === 'Virtual' ? 'Http' : 'File',
                video3DFormat: item.Video3DFormat
            };
            games = {
                mediaType: item.MediaType,
                videoType: item.VideoType,
                gameSystem: item.GameSystem,
                gameName: item.Name,
                gamePath: item.Path,
                protocol: item.LocationType === 'Remote' || item.LocationType === 'Virtual' ? 'Http' : 'File',
                video3DFormat: item.Video3DFormat
            };
            return getPlayer(options) != null;

        };

        function getPlayer(options) {
            var streamInfo = Object.assign({}, options);

            if (options.mediaSource) {
                streamInfo.videoType = options.mediaSource.VideoType;
                streamInfo.protocol = options.mediaSource.Protocol;
                streamInfo.video3DFormat = options.mediaSource.Video3DFormat;
            }

            if (options.item) {
                streamInfo.gameSystem = options.item.GameSystemId || options.item.GameSystem;
                streamInfo.gameName = options.item.Name;
            }
  
 
            return getPlayers().filter(function (player) {

                return isConfiguredToPlay(player, streamInfo);

            })[0];
        }

        function isConfiguredToPlay(player, options) {
            console.log(options);
            //alert(player.gameSystem);
            //alert(options.gameSystem);
            if (!shell.canExec) {
                return false;
            }

            if (player.mediaType !== options.mediaType) {
                return false;
            }

            if (options.mediaType === 'Game') {
                if (options.gameSystem == 'PC' || options.gameSystem == 'DOS') {
                    if (player.gameName != options.gameName) {
                        return false;
                    }
                }
                else {
                    if (player.gameSystem != options.gameSystem) {
                        return false;
                    }
                }

                return true;
            }

            var typeFilters = getTypeFilters(options);

            var invalidTypeFilters = typeFilters.filter(function (typeFilter) {

                return player[typeFilter] === false;

            });

            if (invalidTypeFilters.length) {
                return false;
            }

            if (options.mediaType === 'Video' && player['videotype-3d'] === true && !options.video3DFormat) {

                return false;
            }

            return true;
        }

        function getTypeFilters(options) {

            var filters = [];

            if (options.mediaType === 'Video') {

                switch ((options.videoType || '').toLowerCase()) {
                    case 'iso':
                        filters.push('videotype-iso');
                        break;
                    case 'dvd':
                        filters.push('videotype-dvd');
                        break;
                    case 'bluray':
                        filters.push('videotype-bluray');
                        break;
                    case 'hddvd':
                        filters.push('videotype-hddvd');
                        break;
                    default:
                        break;
                }

                if (!filters.length) {
                    if (options.protocol !== 'File') {
                        filters.push('videotype-stream');
                    } else {
                        filters.push('videotype-file');
                    }
                }
            }

            return filters;
        }

        self.currentSrc = function () {
            return currentSrc;
        };

        function getPlayers() {

            var players = JSON.parse(appSettings.get('externalplayers') || '[]');
        
            return players;
        }

        function replaceAll(str, strReplace, strWith) {
            // See http://stackoverflow.com/a/3561711/556609
            var esc = strReplace.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            var reg = new RegExp(esc, 'ig');
            return str.replace(reg, strWith);
        }

        function replaceArg(str, arg, value) {

            return replaceAll(str, arg, value);
        }

        function getArguments(player, streamUrl, options) {

            var startPosMs = (options.playerStartPositionTicks || 0) / 10000;

            return (player.arguments || []).map(function (arg) {
                arg = replaceArg(arg, '{path}', streamUrl);
                arg = replaceArg(arg, '{ms}', startPosMs);
                return arg;
            });
        }

        function modifyStreamUrl(options) {

            var url = options.url;
            if (options.gamePath) {
                url = options.gamePath;
            }
            var mediaSource = options.mediaSource;

            if (!mediaSource || mediaSource.Protocol !== 'File' || url === mediaSource.Path) {
                return Promise.resolve(url);
            }

            var method = mediaSource.VideoType === 'BluRay' || mediaSource.VideoType === 'Dvd' || mediaSource.VideoType === 'HdDvd' ?
                'directoryExists' :
                'fileExists';

            return fileSystem[method](mediaSource.Path).then(function () {
                return mediaSource.Path;
            }, function () {
                return url;
            });
        }

        self.play = function (options) {
            if (games.mediaType === 'Game') {
                options = games;
            }
            var player = getPlayer(options);
            var path = player.path;

            return modifyStreamUrl(options).then(function (streamUrl) {
                return shell.exec({
                    path: path,
                    arguments: getArguments(player, streamUrl, options).join('|||')

                }).then(function (process) {

                    currentProcess = process;

                    // ignore errors because if the process is force closed it may be mis-interpreted as an error
                    process.promise.then(onEnded, onEnded);
                    return Promise.resolve();
                });
            });
        };

        self.setSubtitleStreamIndex = function (index) {
        };

        self.canSetAudioStreamIndex = function () {
            return false;
        };

        self.setAudioStreamIndex = function (index) {

        };

        // Save this for when playback stops, because querying the time at that point might return 0
        self.currentTime = function (val) {
            return null;
        };

        self.duration = function (val) {
            return null;
        };

        self.stop = function (destroyPlayer, reportEnded) {

            return closePlayer().then(function () {
                onEndedInternal(reportEnded);
                return Promise.resolve();
            });
        };

        self.destroy = function () {
            closePlayer();
        };

        function closePlayer() {

            var process = currentProcess;
            currentProcess = null;

            if (process) {
                //return shell.close(process.id);
            }

            return Promise.resolve();
        }

        self.pause = function () {
        };

        self.unpause = function () {
        };

        self.paused = function () {
            return false;
        };

        self.volume = function (val) {
        };

        self.setMute = function (mute) {
        };

        self.isMuted = function () {
        };

        function onEnded() {

            currentProcess = null;
            onEndedInternal(true);
        }

        function onError() {

            currentProcess = null;
            Events.trigger(self, 'error');
        }

        function onEndedInternal(triggerEnded) {

            if (triggerEnded) {
                var stopInfo = {
                    src: currentSrc
                };

                Events.trigger(self, 'stopped', [stopInfo]);
            }

            currentSrc = null;
        }

        self.getTranslations = function () {

            var files = [];

            var languages = ['bg-BG', 'cs', 'de', 'el', 'en-GB', 'en-US', 'es', 'es-MX', 'fr', 'gsw', 'he', 'hr', 'hu', 'it', 'kk', 'ko', 'lt-LT', 'nl', 'pl', 'pt-BR', 'pt-PT', 'ru', 'sk', 'sl-SI', 'sv', 'zh-CN'];

            return languages.map(function (i) {
                return {
                    lang: i,
                    path: pluginManager.mapPath(self, 'strings/' + i + '.json')
                };
            });
        };

        self.getRoutes = function () {

            var routes = [];

            routes.push({
                path: 'application.html',
                transition: 'slide',
                controller: pluginManager.mapPath(self, 'application.js')
            });

            routes.push({
                path: 'applications.html',
                transition: 'slide',
                controller: pluginManager.mapPath(self, 'applications.js'),
                type: 'settings',
                title: 'Applications',
                category: 'Playback',
                thumbImage: ''
            });


            return routes;
        };

        self.getDeviceProfile = function () {

            var bitrateSetting = appSettings.maxStreamingBitrate();

            var profile = {};

            profile.MaxStreamingBitrate = bitrateSetting;
            profile.MaxStaticBitrate = 100000000;
            profile.MusicStreamingTranscodingBitrate = 192000;

            profile.DirectPlayProfiles = [];

            profile.DirectPlayProfiles.push({
                Container: 'm4v,3gp,ts,mpegts,mov,xvid,vob,mkv,wmv,asf,ogm,ogv,m2v,avi,mpg,mpeg,mp4,webm,wtv,dvr-ms,iso,m2ts',
                Type: 'Video'
            });

            profile.DirectPlayProfiles.push({
                Container: 'aac,mp3,mpa,wav,wma,mp2,ogg,oga,webma,ape,opus,flac',
                Type: 'Audio'
            });

            profile.TranscodingProfiles = [];

            profile.TranscodingProfiles.push({
                Container: 'mkv',
                Type: 'Video',
                AudioCodec: 'aac,mp3,ac3',
                VideoCodec: 'h264',
                Context: 'Streaming'
            });

            profile.TranscodingProfiles.push({
                Container: 'mp3',
                Type: 'Audio',
                AudioCodec: 'mp3',
                Context: 'Streaming',
                Protocol: 'http'
            });

            profile.ContainerProfiles = [];

            profile.CodecProfiles = [];

            // Subtitle profiles
            // External vtt or burn in
            profile.SubtitleProfiles = [];
            profile.SubtitleProfiles.push({
                Format: 'srt',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'subrip',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'ass',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'ssa',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'pgs',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'pgssub',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'dvdsub',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'vtt',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'sub',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'idx',
                Method: 'Embed'
            });
            profile.SubtitleProfiles.push({
                Format: 'smi',
                Method: 'Embed'
            });

            profile.ResponseProfiles = [];

            return Promise.resolve(profile);
        };

        
    };
});