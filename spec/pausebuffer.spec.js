const pausebuffer = require("../lib/pausebuffer.js");

const managedFunctions = ['action', 'say'];
const passThroughFunctions = ['api', 'ban', 'clear', 'color', 'connect',
        'disconnect', 'emoteonly', 'emoteonlyoff', 'followersonly',
        'followersonlyoff', 'getChannels', 'getOptions', 'getUsername', 'host',
        'isMod', 'join', 'mod', 'mods', 'on', 'part', 'ping', 'r9kbeta',
        'r9kbetaoff', 'raw', 'readyState', 'slow', 'slowoff', 'subscribers',
        'subscribersoff', 'timeout', 'unban', 'unhost', 'unmod', 'whisper'];


describe("pausebuffer", function () {

  beforeEach(function () {
    jasmine.clock().install();

    this.clientMock = {};
    for( const pt of passThroughFunctions ) {
      this.clientMock[pt] = function () {}
    }
    for( const m of managedFunctions ) {
      this.clientMock[m] = jasmine.createSpy(m);
    }

    this.pb = pausebuffer.wrap(this.clientMock);
  });

  afterEach(function () {
    jasmine.clock().uninstall();
  });

  describe("by default", function () {
    it("holds the 20th managed call back for 35s", function () {
      var expected = [];
      for( m of managedFunctions ) { expected.push(0); }

      for(let i = 0; i < 20; i++) {
        this.pb[managedFunctions[i % managedFunctions.length]]
                                              ("channelx", `message-${i}`);
        if (i < 19) {expected[i % managedFunctions.length]++;}
      }

      jasmine.clock().tick(34999);
      for(let i = 0; i < 19; i++) {
        expect(this.clientMock[managedFunctions[i % managedFunctions.length]])
                              .toHaveBeenCalledWith("channelx", `message-${i}`)
      }
      for(let i = 0; i < managedFunctions.length; i++) {
        expect(this.clientMock[managedFunctions[i]])
                                         .toHaveBeenCalledTimes(expected[i]);
        this.clientMock[managedFunctions[i]].calls.reset();
      }

      jasmine.clock().tick(1);
      expect(this.clientMock[managedFunctions[19 % managedFunctions.length]])
                             .toHaveBeenCalledWith("channelx", "message-19");
    });

    it("makes at most 1 call per 1.5s and at most 19 calls in any 35s period",
        function () {
      
      for(let i = 0; i < 57; i++) {
        this.pb[managedFunctions[i % managedFunctions.length]]
                                              ("channelx", `message-${i}`);
      }

      let n = 0;
      while( n < 57 ) {
        for(let i = 0; i < 19; i++) {
          let spy = 
               this.clientMock[managedFunctions[n % managedFunctions.length]];
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy).toHaveBeenCalledWith("channelx", `message-${n}`);
          spy.calls.reset();
          jasmine.clock().tick(1499);
          expect(
              this.clientMock[managedFunctions[(n+1) % managedFunctions.length]]
            ).not.toHaveBeenCalled();
          jasmine.clock().tick(1);
          n++;
        }
        jasmine.clock().tick(6500);
      }

      jasmine.clock().tick(100000);
      for( const m of managedFunctions ) {
        expect(this.clientMock[m]).not.toHaveBeenCalled();
      }
    });
  });

  it("queues high-priority messages ahead of normal messages", function () {
    this.pb.say("channelx", "initial message to start a throttle");
    this.clientMock.say.calls.reset();

    this.pb.say("channelx", "message with normal priority");
    this.pb.say("channelx", "message with high priority", 2);
    this.pb.say("channelx", "second message with normal priority", 1);
    this.pb.say("channelx", "second message with high priority", 2);

    jasmine.clock().tick(1500);
    expect(this.clientMock.say).toHaveBeenCalledTimes(1);
    expect(this.clientMock.say).toHaveBeenCalledWith(
                            "channelx", "message with high priority");

    jasmine.clock().tick(1500);
    expect(this.clientMock.say).toHaveBeenCalledTimes(2);
    expect(this.clientMock.say).toHaveBeenCalledWith(
                            "channelx", "second message with high priority");

    jasmine.clock().tick(1500);
    expect(this.clientMock.say).toHaveBeenCalledTimes(3);
    expect(this.clientMock.say).toHaveBeenCalledWith(
                            "channelx", "message with normal priority");

    jasmine.clock().tick(1500);
    expect(this.clientMock.say).toHaveBeenCalledTimes(4);
    expect(this.clientMock.say).toHaveBeenCalledWith(
                            "channelx", "second message with normal priority");
  });

  it("queues low-priority messages behind normal messages", function () {
    this.pb.say("channelx", "initial message to start a throttle");
    this.clientMock.say.calls.reset();

    this.pb.say("channelx", "message with low priority", 0);
    this.pb.say("channelx", "message with normal priority", 1);
    this.pb.say("channelx", "second message with low priority", 0);
    this.pb.say("channelx", "second message with normal priority", 1);

    jasmine.clock().tick(1500);
    expect(this.clientMock.say).toHaveBeenCalledTimes(1);
    expect(this.clientMock.say).toHaveBeenCalledWith(
                            "channelx", "message with normal priority");

    jasmine.clock().tick(1500);
    expect(this.clientMock.say).toHaveBeenCalledTimes(2);
    expect(this.clientMock.say).toHaveBeenCalledWith(
                            "channelx", "second message with normal priority");

    jasmine.clock().tick(1500);
    expect(this.clientMock.say).toHaveBeenCalledTimes(3);
    expect(this.clientMock.say).toHaveBeenCalledWith(
                            "channelx", "message with low priority");

    jasmine.clock().tick(1500);
    expect(this.clientMock.say).toHaveBeenCalledTimes(4);
    expect(this.clientMock.say).toHaveBeenCalledWith(
                            "channelx", "second message with low priority");
  });

  it("drops low-priority messges during high traffic periods", function () {
    this.pb.setThreshold(0);
    this.pb.say("channelx", "drop me", 0);
    jasmine.clock().tick(100000);
    expect(this.clientMock.say).not.toHaveBeenCalled();

    this.pb.setThreshold(1);
    this.pb.say("channelx", "send me", 0);
    expect(this.clientMock.say).toHaveBeenCalledTimes(1);
    expect(this.clientMock.say).toHaveBeenCalledWith("channelx", "send me");
  });

  it("can be configured so low-priority messages 'time out'", function () {
    this.pb.setLowPriorityTimeout(2);

    this.pb.say("channelx", "start throttle");
    this.pb.action("channelx", "twiddles thumbs", 0);
    jasmine.clock().tick(10000);
    expect(this.clientMock.action).toHaveBeenCalled();
    this.clientMock.action.calls.reset();

    this.pb.say("channelx", "start throttle");
    this.pb.action("channelx", "twiddles thumbs", 0);
    this.pb.say("channelx", "prempt action past timeout");
    jasmine.clock().tick(10000);
    expect(this.clientMock.action).not.toHaveBeenCalled();
  });

  it("lets you change the message count limit", function () {
    const limit = Math.floor(Math.random() * 15) + 2;
    this.pb.setMessageCountLimit(limit);

    for (let i = 0; i < limit; i++) {
      this.pb.say("channelx", `message-${i}`);
    }
    jasmine.clock().tick(34999);

    expect(this.clientMock.say).toHaveBeenCalledTimes(limit-1);
    expect(this.clientMock.say)
                   .not.toHaveBeenCalledWith("channelx", `message-${limit-1}`);
    jasmine.clock().tick(1);
    expect(this.clientMock.say).toHaveBeenCalledTimes(limit);
    expect(this.clientMock.say)
                       .toHaveBeenCalledWith("channelx", `message-${limit-1}`);
  });

  it("won't let you set the message count limit below 2", function () {
    this.pb.setMessageCountLimit(1);

    this.pb.say("channelx", "message-0");
    this.pb.say("channelx", "message-1");
    jasmine.clock().tick(34999);

    expect(this.clientMock.say).toHaveBeenCalledTimes(1);
    expect(this.clientMock.say)
                            .not.toHaveBeenCalledWith("channelx", "message-1");
    jasmine.clock().tick(1);
    expect(this.clientMock.say).toHaveBeenCalledTimes(2);
    expect(this.clientMock.say).toHaveBeenCalledWith("channelx", "message-1");
  });

  it("lets you change the message count duration", function () {
    const duration = 31 + Math.floor(Math.random() * 30);
    this.pb.setMessageCountDuration(duration);

    for (let i = 0; i < 20; i++) {
      this.pb.say("channelx", `message-${i}`);
    }
    jasmine.clock().tick((1000 * duration) + 4999);

    expect(this.clientMock.say).toHaveBeenCalledTimes(19);
    expect(this.clientMock.say)
                           .not.toHaveBeenCalledWith("channelx", `message-19`);
    jasmine.clock().tick(1);
    expect(this.clientMock.say).toHaveBeenCalledTimes(20);
    expect(this.clientMock.say).toHaveBeenCalledWith("channelx", `message-19`);
  });

  it("won't let you set the message count duration below 1", function () {
    this.pb.setThrottle({low: 0, high: 0});
    this.pb.setMessageCountDuration(0);

    for (let i = 0; i < 20; i++) {
      this.pb.say("channelx", `message-${i}`);
    }
    jasmine.clock().tick(5999);

    expect(this.clientMock.say).toHaveBeenCalledTimes(19);
    expect(this.clientMock.say)
                           .not.toHaveBeenCalledWith("channelx", `message-19`);
    jasmine.clock().tick(1);
    expect(this.clientMock.say).toHaveBeenCalledTimes(20);
    expect(this.clientMock.say).toHaveBeenCalledWith("channelx", `message-19`);
  });

  it("lets you change the message count duration buffer", function () {
    const duration = 6 + Math.floor(Math.random() * 10);
    this.pb.setMessageCountDurationBuffer(duration);

    for (let i = 0; i < 20; i++) {
      this.pb.say("channelx", `message-${i}`);
    }
    jasmine.clock().tick((1000 * duration) + 29999);

    expect(this.clientMock.say).toHaveBeenCalledTimes(19);
    expect(this.clientMock.say)
                           .not.toHaveBeenCalledWith("channelx", `message-19`);
    jasmine.clock().tick(1);
    expect(this.clientMock.say).toHaveBeenCalledTimes(20);
    expect(this.clientMock.say).toHaveBeenCalledWith("channelx", `message-19`);
  });

  it("won't let you set the message count duration buffer below 1",
      function () {
    this.pb.setMessageCountDurationBuffer(0);

    for (let i = 0; i < 20; i++) {
      this.pb.say("channelx", `message-${i}`);
    }
    jasmine.clock().tick(30999);

    expect(this.clientMock.say).toHaveBeenCalledTimes(19);
    expect(this.clientMock.say)
                           .not.toHaveBeenCalledWith("channelx", `message-19`);
    jasmine.clock().tick(1);
    expect(this.clientMock.say).toHaveBeenCalledTimes(20);
    expect(this.clientMock.say).toHaveBeenCalledWith("channelx", `message-19`);
  });

  it("lets you change the 'high' throttle time", function () {
    const throttleHigh = Math.floor(Math.random() * 10000);
    this.pb.setThrottle({high: throttleHigh});
    this.pb.setThreshold(0);

    this.pb.say("channelx", "first");
    this.pb.say("channelx", "second");

    jasmine.clock().tick(throttleHigh - 1);
    expect(this.clientMock.say).toHaveBeenCalledTimes(1);
    expect(this.clientMock.say).toHaveBeenCalledWith("channelx", "first");
    expect(this.clientMock.say).not.toHaveBeenCalledWith("channelx", "second");

    jasmine.clock().tick(1);
    expect(this.clientMock.say).toHaveBeenCalledTimes(2);
    expect(this.clientMock.say).toHaveBeenCalledWith("channelx", "second");
  });

  describe("has a traffic threshold, which", function () {
    it("by default, only uses 'high traffic' rules when at the send limit",
        function () {
      this.pb.setThrottle({low: 0});

      for (let i = 0; i < 21; i++) {
        this.pb.say("channelx", `message-${i}`);
        expect(this.clientMock.say).toHaveBeenCalledTimes(i > 18? 19 : i + 1);
      }
      this.clientMock.say.calls.reset();

      jasmine.clock().tick(35000);
      expect(this.clientMock.say).toHaveBeenCalledTimes(1);
      expect(this.clientMock.say).not
                               .toHaveBeenCalledWith("channelx", "message-20");
      jasmine.clock().tick(1500);
      expect(this.clientMock.say).toHaveBeenCalledTimes(2);
      expect(this.clientMock.say)
                               .toHaveBeenCalledWith("channelx", "message-20");
    });

    it("can be set to use high-traffic rules when halfway to the meesage limit",
        function () {
      this.pb.setThreshold(0.5);
      this.pb.setThrottle({low: 0});
      for (let i = 0; i < 21; i++) {
        this.pb.say("channelx", `message-${i}`);
        expect(this.clientMock.say).toHaveBeenCalledTimes(i > 9? 10 : i + 1);
      }
      this.clientMock.say.calls.reset();

      for (let i = 10; i < 19; i++) {
        jasmine.clock().tick(1500);
        expect(this.clientMock.say).toHaveBeenCalledTimes(1);
        expect(this.clientMock.say)
                          .toHaveBeenCalledWith("channelx", `message-${i}`);
        this.clientMock.say.calls.reset();
      }

      jasmine.clock().tick(21500);
      expect(this.clientMock.say).toHaveBeenCalledTimes(1);
      expect(this.clientMock.say).not
                               .toHaveBeenCalledWith("channelx", "message-20");
      jasmine.clock().tick(1500);
      expect(this.clientMock.say).toHaveBeenCalledTimes(2);
      expect(this.clientMock.say)
                               .toHaveBeenCalledWith("channelx", "message-20");
    });

    it("considers both sent messages and queued messages to define traffic",
        function () {
      for( let i = 0; i < 20; i++) {
        this.pb.say("channelx", "testing");
      }
      expect(this.clientMock.say).toHaveBeenCalledTimes(1);
      
      this.pb.action("channelx", "performs a low-priority action", 0);
      
      jasmine.clock().tick(100000);
      expect(this.clientMock.say).toHaveBeenCalledTimes(20);
      expect(this.clientMock.action).not.toHaveBeenCalled();
    });
  });

  it("lets you change the 'low' throttle time", function () {
    const throttleLow = Math.floor(Math.random() * 1000);
    this.pb.setThrottle({low: throttleLow});

    this.pb.say("channelx", "first");
    this.pb.say("channelx", "second");

    jasmine.clock().tick(throttleLow - 1);
    expect(this.clientMock.say).toHaveBeenCalledTimes(1);
    expect(this.clientMock.say).toHaveBeenCalledWith("channelx", "first");
    expect(this.clientMock.say).not.toHaveBeenCalledWith("channelx", "second");

    jasmine.clock().tick(1);
    expect(this.clientMock.say).toHaveBeenCalledTimes(2);
    expect(this.clientMock.say).toHaveBeenCalledWith("channelx", "second");
  });

  describe("when throttling is disabled", function () {
    beforeEach(function () {
      this.pb.setThrottle({high: 0, low: 0});
    });

    it("holds the 20th managed; sends the first 19 immediately", function () {
      for(let i = 0; i < 20; i++) {
        let spy  =
              this.clientMock[managedFunctions[i % managedFunctions.length]];
        expect(spy).not.toHaveBeenCalled();
        this.pb[managedFunctions[i % managedFunctions.length]]
                                              ("channelx", `message-${i}`);
        if (i < 19) {
          expect(spy).toHaveBeenCalledWith("channelx", `message-${i}`);
          expect(spy).toHaveBeenCalledTimes(1);
          spy.calls.reset();
        } else {
          expect(spy).not.toHaveBeenCalled();
        }
      }

      jasmine.clock().tick(34999);
      for(let i = 0; i < managedFunctions.length; i++) {
        expect(this.clientMock[managedFunctions[i]]).not.toHaveBeenCalled();
      }

      jasmine.clock().tick(1);
      expect(this.clientMock[managedFunctions[19 % managedFunctions.length]])
                             .toHaveBeenCalledWith("channelx", "message-19");
    });

    it("releases queued calls whenever it won't result in 20 calls within 35s",
        function () {
      let n = 0;
      let spies = [];
      for (m of managedFunctions) { spies.push(this.clientMock[m]); }
      for(let i = 1; i <= 10; i++) {
        for(let j = 0; j < i; j++) {
          let spy = spies[n % spies.length];
          this.pb[managedFunctions[n % managedFunctions.length]]
                                              ("channelx", `message-${n}`);
          if (n < 19) {
            expect(spy).toHaveBeenCalledWith("channelx", `message-${n}`);
            expect(spy).toHaveBeenCalledTimes(1);
            spy.calls.reset();
          } else {
            expect(spy).not.toHaveBeenCalled();
          }
          n++;
        }
        jasmine.clock().tick(1000);
      }
      jasmine.clock().tick(24999);

      n = 19;
      while( n < 55 ) {
        for(let i = 1; i <= 6; i++) {
          let expected = [];
          for(const spy of spies) {
            expect(spy).not.toHaveBeenCalled();
            expected.push(0);
          }
          jasmine.clock().tick(1);
          for(let j = 0; j < i; j++) {
            if (n < 55) {
              expect(spies[n % spies.length]).toHaveBeenCalledWith(
                                                  "channelx", `message-${n}`);
              expected[n % spies.length]++;
            }
            if( !(++n % 19) ) {break;}
          }
          for(let j = 0; j < spies.length; j++) {
            expect(spies[j]).toHaveBeenCalledTimes(expected[j]);
            spies[j].calls.reset();
          }
          jasmine.clock().tick(999);
        }
        jasmine.clock().tick(29000);
      }
    });
  });

  for ( const pt of passThroughFunctions ) {
    it(`passes thru calls to ${pt}()`, function () {
      let rval = Math.random();
      let pval = Math.random();

      spyOn(this.clientMock, pt).and.returnValue(rval);
      let result = this.pb[pt](pval, "a", {val:37});

      expect(result).toEqual(rval);
      expect(this.clientMock[pt]).toHaveBeenCalledWith(pval, "a", {val:37});
    });
  }

});
