# pausebuffer

pausebuffer manages message/action timing for your tmi.js-based bots to ensure
compliance with anti-spamming measures.  It cannot, and does not attempt to,
circumvent any anti-spamming measures, but it can help avoid situations where
a bot might accidentally violate them.

Depending on your bot's desired behavior, it may be challenging to ensure that
it won't trigger a lockout by sending too many messages too quickly.  For
example, you might want your bot to send feedback messages in response to
some user commands, but an active chat could then push it to send too many
messages.

There are existing ways to mitigate this:  If a bot can reasonably run on an
account with mod privilege, its limits will be much looser.  You can use
cooldown periods (though if you want to provide cooldown notification, that
can be a catch-22).

Still, it can be easy to miss some usage patterns, and you likely wouldn't
want your bot to lose connectivity during the sort of high-usage period that
might increase the risk of just such a problem.

You can add pausebuffer to your tmi.js-based bot with minimal modification,
and then choose how to handle periods of high message activity.  For simple
strategies this may only require a few lines of code even for an existing bot;
or, by adding pausebuffer-specific parameters when sending a message, you can
more precisely control how your bot reacts to periods of high activity.

Basic whisper throttling is also included (since version 1.1.0).  For a number
of reasons, the whisper rules are much simpler.  (The twitch rate limits for
whispers are simpler / less variable.  The use cases for bots to whisper are
less common - and also more limited due to the limit on recipients each day.
And also, the advanced message/action features have, to the best of my
knowledge, never been used, so it makes sense to use a more YAGNI approach
going forward.)

## Requirements

pausebuffer expects you to provide it with a tmi.js client to wrap.  It is
currently built aganist version 1.2.1 but should work with any verion (or, I
suppose, anything at all) that conforms to the same client interface.

## Download

The simplest way to add pausebuffer to your project is with npm.

    npm install @madelsberger/pausebuffer

Alternately, you can visit the project's 
[github page](https://github.com/madelsberger/pausebuffer).

## Usage

First, tell pausebuffer to wrap your tmi.js client.

    const tmi = require("tmi.js");
    const pb = require("@madelsberger/pausebuffer");

    const opts = {
      // ...
    };
    let client = pb.wrap(new tmi.client(opts));

The object returned by the `wrap()` function can be used just like a normal
tmi.js client; its interface is a superset of the normal client interface. 
Most calls are passed through directly to the client.

If the default settings are suitable for your bot, then that's all you need to
do.  You can use the wrapped `client` object just like a normal one, and
pausebuffer will make sure that

1) No more than 19 chat messages (including /me actions) will be sent within
   any 35-second period.  This prevents the bot from getting disconnected due
   to tmi's message rate limit.  (The strictest limit, applied when the bot
   runs on an unprivileged account, is 20 messages in 30 seconds.  The extra
   5 seconds allow for possible differences in message timing as seen at the
   server.)

2) No two chat messages are sent within any 1.5s period.  This is referred to
   as "throttling".  It may help prevent messages from being dropped for being
   sent too rapidly.  It can also "smooth out" the flow of messages that would
   otherwise be sent in 35-second pulses, in the event a large spike of
   traffic is created in a short period of time.

3) No two whispers are sent within any 0.75s period.

4) Whispers will not be sent to more than 40 recipients during the entire
   session.  (A canWhisperTo(username) function is provided so you can check
   whether a whisper will be bloked for this reason.)
 
The following options are available to modify pausebuffer's behavior.

### Traffic Threshold

The traffic threshold determines when the bot is considered to be generating a
high volume of traffic.  A period of high traffic does not neceessarily mean
that no further messages can be sent; but some behaviors (such as handling of
low-priority messages) depend on whether the traffic volume is high.

    client.setThreshold(1);

The threshold is a value between 0 and 1.  (Attempting to set a value below or
above this range will set the value to 0 or 1, respectively.)  The value
represents a ratio of messages sent to meessages that can be sent; in this
context "messages sent" includes both messages which have been passed through
to the client recently enough to still be counted (i.e. roughly within a number
of seconds equal to `messageCountDuration + messageCountDurationBuffer`; see
*Message Limit* below) and messages that are queued to be sent.

The default value of 1 means that volume is considered high only when the
maximum number of messges have been sent.

A value of 0 would mean that high-volume rules are always used.  (If you're
trying to maintain a constant throttle rate - see *Throttling* below - it's
generally more useful to leave the threshold at 1 and set the high and low
throttle times both to the same value.  This is because if you set the
threshold to 0, it will be impossible to send low-priority messages.)

Usuing in-between values will cause the bot to switch to high-volume rules as 
it appraoches the send limit; for example, with the default send limit (20 in 
30s with a 5s buffer), a threshold of .5 will cause high-voume rules to be used
when there have been 10 messages in the past 35 seconds.

The threshold is effectively applied to a message when the bot first tries to 
send the message.  This means that when a message is queued due to the send 
limit, it will have the high traffic rules applied when it is sent, regardless
of whether traffic "dies down" by the time it is actually sent.  (This behavior
was chosen because it handles many situations more gracefully than if the
traffic volume were reassessed when the message is taken from the queue to be
sent.)

### Message Priority

When sending a message with `say` or `action`, you can specify that the
message priority is low (0), normal (1) or high (2).

    client.say(channel, "This is a high-priority message!", 2);
    client.say(channel, "This is a low-priority message", 0);
    client.say(channel, "This message has normal priority.", 1);
    client.say(channel, "This message also has normal priority.");

    client.action(channel, "performs a high-priority action!", 2);
    client.action(channel, "performs a low-priority action", 0);
    client.action(channel, "performs an action with normal priority", 1);
    client.action(channel, "performs another action with normal priority");

If a high-priority action is placed in the queue, it will be placed ahead of
any messages that are not high-priority.

Low-priority messages will not be sent during times of high traffic.  Also, if
a low-priority message gets into the queue, any subsequent high- or normal-
priority messages will be placed ahead of it.  (The queue order for low-
priority messages may seem academic, since the most obvious way for a message
to be put in the queue is to be sent during a period of high traffic, and the
low-priority message would just be dropped in that case; but it is also 
possible for messages to be queued during low traffic volume as a result of
throttling.)

Additionally, low-priority messages can "time out".  That is, if one is
placed in the queue, but then gets pre-empted by normal- or high-priority 
messages, after waiting in the queue for a certain amount of time, the
low-priority message will be dropped.

    client.setLowPriorityTimeout(0);

The default value (0) means that there is no timeout; but you can set the
timeout to a positive integer `n`, in which case a low-priority message would
time out after `n` "ticks" in the queue.  (This is roughly equivalent to `n`
seconds.)

### Message Limit

You can change the rules for how many messages the bot is allowed to send in
a given period of time.

***WARNING:** The purpose of pausebuffer is to keep your bot compliant with 
anti-spam measures.  At a bare minimum, it tries to avoid disconnects caused 
by sending messages too quickly.  The applicable limit for your bot may be
higher (e.g. if you run your bot on a mod account), so you have the ability
to set looser restrictions in pausebuffer.  But if you set pausebuffer's
limits higher than the limits imposed by tmi, then your bot may experience
unexpected disconnects.*

You can change both the number of messages your bot is allowed to send in a
given period of time, and the period of time in which your bot is allowed to
send that number of messages.

    client.setMessageCountLimit(20);
    client.setMessageCountDuration(30); // in seconds

If you want to set a higher message count limit (or a shorter duration), then
you may also need to adjust the throttle settings (see below), or the
cumulative throttle time could prevent you sending more messages anyway.

Note that pausebuffer will actually send 1 fewer message than the stated limit
(so if you try to set the limit below 2, the limit will be set to 2 instead). 

The minimum message count duration is 1.

Because the timing of messages as seen by the server may differ from the
timing of messages as seen by the client, and also because pausebuffer only
records the timing of messages to a limited precision, a buffer period is
added to the specified duration.  You can change the duration of the buffer
period.

    client.setMessageCountDurationBuffer(5); // in seconds

The minimum buffer time is 1, as this is the bare minimum to account for
the limited precision with which pausebuffer tracks call timing.

### Throttling Controls

pausebuffer can "throttle" messages - i.e. limit the rate at which they are
sent to the server by imposing a delay between messages.  You can specify
two delay values: one to be used when traffic volume is low, and one to be used
when traffic volume is high. 

    client.setThrottle({
      high: 1500  // in miliseconds
    , low: 1500   // in miliseconds
    });

If a key is omitted from the options object (or given an undefined value), 
the corresponding setting will not be changed.

Values are specified in ms.  The default behavior is to throttle all messages
(in both high and low traffic) for 1.5 seconds.

By setting a higher throttle in times of high traffic, you can "smooth out"
the traffic pulses that could otherwise be generated as pausebuffer avoids
ever sending more than the maximum number of messages.

Conversely, you might have a use case in which it makes sense to start with a
relatively high throttle, but then reduce the throttle time during high
traffic in order to keep the bot from falling even further behind.
