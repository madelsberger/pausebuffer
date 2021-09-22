module.exports = {
 
  wrap : function (client) {
    let pb = {};

    for (const f of getFunctions(client)) {
      pb[f] = function () {return client[f].apply(client, arguments);}
    }

    let managerState = {
      tickCount: 0
    , sent: 0
    , sentPerTick: [0]
    , queued: [[], [], []]
    , throttling: false    // would the throttle currently hold a message back?
    , intervalId: null

    , sentLimit : 20
    , sentDuration : 30
    , sentDurationBuffer : 5
    , throttleHigh: 1500   // in ms
    , throttleLow: 1500    // in ms
    , threshold: 1
    , lpTimeout: 0

    , canSend: function () { return (this.sent + 1 < this.sentLimit)
                                 && !this.throttling; }

    , highTraffic: function (sentValue) {
        return (   this.threshold * (this.sentLimit - 1)
                <=    ((typeof sentValue == 'number')? sentValue : this.sent) 
                    + this.queued[0].length + this.queued[1].length
                    + this.queued[2].length
        );
      }  
    };

    pb.action = manage(client, pb.action, managerState);
    pb.say = manage(client, pb.say, managerState);

    pb.whisper = throttledWhisper(client);
    pb.canWhisperTo = canWhisperTo;

    pb.setMessageCountLimit = function (limit) {
      managerState.sentLimit = (limit < 2)? 2 : limit;
    };
    pb.setMessageCountDuration = function (duration) {
      managerState.sentDuration = (duration < 1)? 1 : duration;
    };
    pb.setMessageCountDurationBuffer = function (duration) {
      managerState.sentDurationBuffer = (duration < 1)? 1 : duration;
    };
    pb.setThrottle = function (opts) {
      if (typeof opts.high == 'number') {
        managerState.throttleHigh = (opts.high < 0)? 0 : opts.high;
      }
      if (typeof opts.low == 'number') {
        managerState.throttleLow = (opts.low < 0)? 0 : opts.low;
      }
    };
    pb.setThreshold = function (threshold) {
      managerState.threshold =  (threshold < 0)? 0
                              : (threshold > 1)? 1
                              : threshold;
    };
    pb.setLowPriorityTimeout = function (ticks) {
      managerState.lpTimeout = ticks;
    };

    return pb;
  }

};

const getFunctions = function (obj) {
  let funcNames = [];
  for( o = obj; o != null; o = Object.getPrototypeOf(o) ) {
    for( p in o ) {
      if (typeof o[p] == 'function') {funcNames.push(p);}
    }
  }

  return funcNames;
}

const manage = function (client, f, managerState) {
  if (typeof f == 'function') {
    return function (channel, message, priority) {
      if (priority !== 0 && priority !== 2) {priority = 1;}
      if (priority || !managerState.highTraffic() ) {
        if (managerState.canSend()) {
          send(client, f, [channel, message], managerState);
        } else {
          managerState.queued[priority].push({
            t: managerState.tickCount
          , c: client
          , f: f
          , a: [channel, message]
          , s: managerState.sent });
        }
        if (managerState.intervalId == null) {
          managerState.intervalId = setInterval(function () {
            tick(managerState);
          }, 1000);
        }
      }
    };
  }
}

const tick = function (managerState) {
  managerState.sentPerTick.unshift(0);
  if (managerState.sentPerTick.length
            > managerState.sentDuration + managerState.sentDurationBuffer) {
    managerState.sent -= managerState.sentPerTick.pop();
    checkQueue(managerState);

    if (!managerState.sent) {
      clearInterval(managerState.intervalId);
      managerState.intervalId = null;
    }
  }
  managerState.tickCount++;
}

const send = function (client, f, a, managerState, sentValue) {
  if (! managerState.throttling) {
    managerState.sent++;
    managerState.sentPerTick[0]++;
    f.apply(client, a);

    let throttleTime = managerState.highTraffic(sentValue)
                       ? managerState.throttleHigh : managerState.throttleLow;

    if ( throttleTime ) {
      managerState.throttling = true;
      setTimeout(function () {
        managerState.throttling = false;
        checkQueue(managerState);
      }, throttleTime);
    }
  }
}

const checkQueue = function (managerState) {
  let toSend;
  while (managerState.canSend() ) {
    toSend = undefined;
    if (managerState.queued[2].length) {
      toSend = managerState.queued[2].shift();
    } else if (managerState.queued[1].length) {
      toSend = managerState.queued[1].shift();
    } else if (managerState.queued[0].length) {
      toSend = managerState.queued[0].shift();
      while(   managerState.lpTimeout && toSend
            && toSend.t + managerState.lpTimeout <= managerState.tickCount) {
        toSend = managerState.queued[0].shift();
      }
    }
    if (!toSend) { break; }

    send(toSend.c, toSend.f, toSend.a, managerState, toSend.s);
  }
}

const whisperRecipients = new Set();

const throttledWhisper = function (client) {
  let nextWhisperTime = undefined;

  return function (user, message) {
    if (canWhisperTo(user)) {
      whisperRecipients.add(user);
      if (!nextWhisperTime) {
        client.whisper(user, message);
        nextWhisperTime = Date.now() + 750;
      } else {
        setTimeout(function() {
          client.whisper(user, message);
        }, Math.max(0, nextWhisperTime - Date.now()));
        nextWhisperTime += 750;
      }
    }
  };
}

const canWhisperTo = function (username) {
  return whisperRecipients.size < 40 || whisperRecipients.has(username);
}
