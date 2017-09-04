define(['loading', 'appSettings', 'focusManager', 'scrollHelper', 'layoutManager', 'paper-icon-button-light', 'listViewStyle'], function (loading, appSettings, focusManager, scrollHelper, layoutManager) {
    "use strict";

    return function (view, params) {

        var self = this;

        view.querySelector('.btnAdd').addEventListener('click', function () {

            editPlayer();
        });

        function editPlayer(id) {

            var url = Emby.PluginManager.mapRoute('application', 'application.html');
            if (id) {
                url += '?id=' + id;
            }
            Emby.Page.show(url);
        }

        function deletePlayer(id) {

            var players = getPlayers().filter(function (p) {
                return p.id !== id;
            });
            appSettings.set('applications', JSON.stringify(players));
            loadPlayers();
        }

        function parentWithClass(elem, className) {

            while (!elem.classList || !elem.classList.contains(className)) {
                elem = elem.parentNode;

                if (!elem) {
                    return null;
                }
            }

            return elem;
        }

        view.querySelector('.players').addEventListener('click', function (e) {

            var playerItem = parentWithClass(e.target, 'playerItem');
            if (playerItem) {
                var btnOptions = parentWithClass(e.target, 'btnOptions');

                if (layoutManager.tv || btnOptions) {
                    var playerId = playerItem.getAttribute('data-id');
                    showOptionsMenu(playerId, btnOptions);
                }
            }
        });

        view.addEventListener('viewshow', function (e) {

            var isRestored = e.detail.isRestored;

            Emby.Page.setTitle(Globalize.translate('application#Applications'));

            loading.hide();

            if (!isRestored) {
                scrollHelper.centerFocus.on(view.querySelector('.smoothScrollY'), false);
            }

            loadPlayers();
        });

        function showOptionsMenu(playerId, buttonElement) {

            var player = getPlayers().filter(function (p) {
                return p.id === playerId;
            })[0];

            if (!player) {
                return;
            }

            require(['actionsheet'], function (actionsheet) {

                var menuItems = [];

                menuItems.push({
                    name: Globalize.translate('application#Edit'),
                    id: 'edit'
                });

                menuItems.push({
                    name: Globalize.translate('application#Delete'),
                    id: 'delete'
                });

                actionsheet.show({
                    items: menuItems,
                    title: Globalize.translate('application#Application')

                }).then(function (id) {
                    switch (id) {
                        case 'edit':
                            editPlayer(playerId);
                            break;
                        case 'delete':
                            deletePlayer(playerId);
                            break;
                        default:
                            break;
                    }
                });

            });
        }

        function getPlayerHtml(player) {

            var html = '';
            var icon = 'live_tv';

            if (player.mediaType === 'Game') {
                icon = 'games';
            } else if (player.mediaType === 'Audio') {
                icon = 'audiotrack';
            }

            var tagName = layoutManager.tv ? 'button' : 'div';
            var className = layoutManager.tv ? 'listItem btnOptions playerItem' : 'listItem playerItem';

            html += '<' + tagName + ' class="playerItem ' + className + '" data-id="' + (player.id || '') + '">';

            html += '<i class="md-icon listItemIcon">' + icon + '</i>';

            html += '<div class="listItemBody">';

            if (player.mediaType) {
                html += '<div>';
                html += Globalize.translate('application#' + player.mediaType);
                html += '</div>';
            }

            if (player.path) {
                html += '<div class="secondary">';
                html += player.path;
                html += '</div>';
            }

            html += '</div>';

            if (!layoutManager.tv) {
                html += '<button type="button" is="paper-icon-button-light" class="btnOptions"><i class="md-icon">more_vert</i></button>';
            }

            html += '</' + tagName + '>';
            return html;
        }

        function loadPlayers() {

            var html = getPlayers().map(getPlayerHtml).join('');

            view.querySelector('.players').innerHTML = html;
            focusManager.autoFocus(view);
        }

        function getPlayers() {

            return JSON.parse(appSettings.get('applications') || '[]');
        }
    };

});