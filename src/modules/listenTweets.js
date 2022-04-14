const needle = require("needle");
const { sendErrorToLogChannel } = require("../utils");

const token = process.env.TWITTER_BEARER_TOKEN;
const rulesURL = "https://api.twitter.com/2/tweets/search/stream/rules";
const streamURL = "https://api.twitter.com/2/tweets/search/stream";

const rules = [
  {
    value: `from:${process.env.TWITTER_OFFICIAL_CHANNEL_NAME} -is:retweet`,
  },
];

const listenTweets = async (bot) => {
  let currentRules;
  bot.once("ready", () => {
    console.log("Twitter bot is ready to use!");
  });

  try {
    currentRules = await getAllRules(bot);
    await deleteAllRules(currentRules, bot);
    await setRules(bot);
    streamConnect(bot, 0);
  } catch (e) {
    sendErrorToLogChannel(bot, "Error while listening tweets: ", e);
  }
};

const streamConnect = (bot, retryAttempt) => {
  const stream = needle.get(streamURL, {
    headers: {
      "User-Agent": "v2FilterStreamJS",
      Authorization: `Bearer ${token}`,
    },
    timeout: 20000,
  });

  stream
    .on("data", async (data) => {
      try {
        const tweet = JSON.parse(data);
        await sendTweetToChannel(bot, tweet);
        retryAttempt = 0;
      } catch (e) {
        if (
          data.detail ===
          "This stream is currently at the maximum allowed connection limit."
        ) {
          sendErrorToLogChannel(bot, data.detail, e);
        }
      }
    })
    .on("err", (error) => {
      if (error.code !== "ECONNRESET") {
        console.log(error.code);
      } else {
        setTimeout(() => {
          console.warn("A connection error occurred. Reconnecting...");
          streamConnect(++retryAttempt);
        }, 2 ** retryAttempt);
      }
    });

  return stream;
};

const sendTweetToChannel = async (bot, tweet) => {
  const channel = await bot?.channels?.cache?.get(
    process.env.DISCORD_TWEETS_CHANNEL_ID
  );
  const tweetText = tweet?.data?.text;
  if (channel && tweetText && tweet?.data?.id) {
    const tweetURL = `https://twitter.com/${process.env.TWITTER_OFFICIAL_CHANNEL_NAME}/status/${tweet?.data?.id}`;
    channel.send(`${tweetURL}`);
  } else {
    sendErrorToLogChannel(
      bot,
      "Channel undefined OR tweet is in wrong format or undefined"
    );
  }
};

const getAllRules = async (bot) => {
  const response = await needle("get", rulesURL, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
  if (response.statusCode !== 200) {
    sendErrorToLogChannel(bot, response.statusMessage);
  }
  return response.body;
};

const deleteAllRules = async (rules, bot) => {
  if (!Array.isArray(rules.data)) {
    return null;
  }
  const ids = rules.data.map((rule) => rule.id);
  const data = {
    delete: {
      ids: ids,
    },
  };

  const response = await needle("post", rulesURL, data, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
  });

  if (response.statusCode !== 200) {
    sendErrorToLogChannel(bot, response.body);
  }
  return response.body;
};

const setRules = async (bot) => {
  const data = {
    add: rules,
  };
  const response = await needle("post", rulesURL, data, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
  });

  if (response.statusCode !== 201) {
    sendErrorToLogChannel(bot, response.body);
  }
  return response.body;
};

module.exports = listenTweets;
