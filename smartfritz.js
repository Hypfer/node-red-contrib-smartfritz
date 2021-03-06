var fritz = require('smartfritz-promise');

module.exports = function (RED) {

    function SmartfritzConfigNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        node.fritzip = n.fritzip;
        node.sid = null;
        var sessionID;
        var username = node.credentials.username ? node.credentials.username : "";
        var password = node.credentials.password ? node.credentials.password : "";

        try {
            node.log('Init SmartfritzConfigNode.');

            fritz.getSessionID(username, password,
                function (sessionID) {
                    node.log('Session ID: ' + sessionID);
                    if ((!sessionID) || (sessionID === '0000000000000000')) {
                        node.error('Error logging in to Fritz IP: ' + node.fritzip +
                            '. \nWrong password?');
                        return;
                    }
                    node.sid = sessionID;
                }, {
                    url: node.fritzip
                });

        } catch (err) {
            node.error(err + ' IP (' + node.fritzip + ').');
        }
    }

    RED.nodes.registerType("smartfritz-config", SmartfritzConfigNode, {
        credentials: {
            username: {
                type: "text"
            },
            password: {
                type: "password"
            }
        }
    });


    /* ---------------------------------------------------------------------------
     * WRITE node
     * -------------------------------------------------------------------------*/
    function FritzWriteNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        node.config = RED.nodes.getNode(n.config);

        if (!node.config) {
            node.error("Config node missing.");
            node.status({
                fill: "red",
                shape: "ring",
                text: "Error. Config node missing."
            });
            return;
        }

        var sessionID;
        var actorID;

        node.on('input', function (msg) {
            node.log('FritzWriteNode called');
            sessionID = node.config.sid;

            if (!sessionID) {
                node.error('No session established.');
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Error. No session established."
                });
                return;
            }
            try {
                fritz.getSwitchList(sessionID, function (actorID) {
                        if (n.aid) {
                            node.log('Using configured AID.');
                            actorID = n.aid;
                        }

                        if (!actorID) {
                            node.error('No Switch found, Fritz IP (' + node
                                .config.fritzip + ')');
                            node.status({
                                fill: "red",
                                shape: "ring",
                                text: "Error. No Switch found, Fritz IP (" + node.config
                                    .fritzip + ")"
                            });
                            return;
                        }
                        node.log('AID: ' + actorID);
                        node.log('Write SwitchState to:' + msg.payload);


                        function retSwitchOnOff(funRet) {
                            if (funRet === '') {
                                node.error(
                                    'Error writing Switch. Fritz IP (' +
                                    node.config.fritzip +
                                    ')');
                                node.status({
                                    fill: "red",
                                    shape: "ring",
                                    text: "Error writing Switch. Fritz IP (" +
                                    node.config.fritzip +
                                    ")"
                                });
                                return;
                            }

                            msg.payload = {
                                sessionId: sessionID,
                                actorID: actorID,
                                switchState: funRet
                            };
                            node.status({
                                fill: "green",
                                shape: "dot",
                                text: "OK"
                            });
                            node.send(msg);
                        }

                        if (
                            (msg.payload === 'true') || (msg.payload === '1') ||
                            (msg.payload === 1) || (msg.payload === true)
                        ) {
                            node.log('SwitchOn Switch AID: ' + actorID);
                            fritz.setSwitchOn(sessionID, actorID, retSwitchOnOff, {url: node.fritzip});
                        } else if (
                            (msg.payload === 'false') || (msg.payload === '0') ||
                            (msg.payload === 0) || (msg.payload === false)
                        ) {
                            node.log('SwitchOff Switch AID: ' + actorID);
                            fritz.setSwitchOff(sessionID, actorID, retSwitchOnOff, {url: node.fritzip});
                        } else {
                            node.error('Error interpreting SwitchState: ' +
                                msg.payload);
                        }
                    },
                    {
                        url: node.fritzip
                    });
            } catch (err) {
                node.error('Error: ' + err);
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Error" + err
                });
            }
        });
    }

    RED.nodes.registerType('fritz write', FritzWriteNode);


    /* ---------------------------------------------------------------------------
     * READ node
     * -------------------------------------------------------------------------*/
    function FritzReadNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        node.config = RED.nodes.getNode(n.config);

        if (!node.config) {
            node.error("Config node missing");
            node.status({
                fill: "red",
                shape: "ring",
                text: "Error. Config node missing"
            });
            return;
        }

        var sessionID;
        var actorID;

        node.on('input', function (msg) {
            node.log('FritzReadNode called');
            sessionID = node.config.sid;

            if (!sessionID) {
                node.error('Error no session established.');
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Error. No session established."
                });
                return;
            }

            try {
                fritz.getSwitchList(sessionID, function (actorID) {
                    if (n.aid) {
                        node.log('Using configured AID.');
                        actorID = n.aid;
                    }

                    if (!actorID) {
                        node.error('No Switch found, Fritz IP (' + node
                            .config.fritzip + ')');
                        node.status({
                            fill: "red",
                            shape: "ring",
                            text: "Error. No Switch found, Fritz IP (" + node
                                .config.fritzip + ")"
                        });
                        return;
                    }
                    node.log('AID: ' + actorID);

                    fritz.getSwitchEnergy(sessionID, actorID, function (switchEnergy) {

                        fritz.getSwitchPower(sessionID, actorID,
                            function (switchPower) {

                                fritz.getSwitchState(sessionID, actorID,
                                    function (switchState) {


                                        msg.payload = {
                                            sessionID: sessionID,
                                            actorID: actorID,
                                            switchState: switchState,
                                            switchEnergy: switchEnergy,
                                            switchPower: switchPower
                                        };

                                        if (switchState ===
                                            'HTTP/1.0 500 Internal Server Error\nContent-Length: 0\nContent-Type: text/plain; charset=utf-8'
                                        ) {
                                            node.error(
                                                'Switch not ready (yet).'
                                            );
                                            node.log('msg.payload: ' + JSON.stringify(
                                                msg.payload));
                                            node.status({
                                                fill: "red",
                                                shape: "ring",
                                                text: "Error. Switch not ready (yet)."
                                            });
                                            return;
                                        }
                                        if (
                                            (switchEnergy === 'inval') ||
                                            (switchPower === 'inval') ||
                                            (switchState === 'inval')
                                        ) {
                                            node.error(
                                                'Error Switch values invalid.'
                                            );
                                            node.log('msg.payload: ' + JSON.stringify(
                                                msg.payload));
                                            node.status({
                                                fill: "red",
                                                shape: "ring",
                                                text: "Error. Switch values invalid."
                                            });
                                            return;
                                        }

                                        node.status({
                                            fill: "green",
                                            shape: "dot",
                                            text: "OK"
                                        });
                                        node.send(msg);
                                    }, {url: node.fritzip});
                            }, {url: node.fritzip});
                    }, {url: node.fritzip});
                }, {url: node.fritzip});
            } catch (err) {
                node.error('Error: ' + err);
                node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Error" + err
                });
            }
        });
    }

    RED.nodes.registerType('fritz read', FritzReadNode);
};
