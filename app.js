const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running...')
    })
  } catch (e) {
    console.log(`DB error: ${e.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'Secret_Token', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

// Register API
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const hashPassword = await bcrypt.hash(password, 10)
  const checkUserQuery = `SELECT * FROM user WHERE username = '${username}';`

  const dbUser = await db.get(checkUserQuery)

  if (dbUser === undefined) {
    const createUserQuery = `
        INSERT INTO
            user (name, username, password, gender)
        VALUES
            (
                '${name}',
                '${username}',
                '${hashPassword}',
                '${gender}'
            );
        `
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const dbResponse = await db.run(createUserQuery)
      const newUserId = dbResponse.lastID
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

// Login API
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const checkUserQuery = `SELECT * FROM user WHERE username = '${username}';`

  const dbUser = await db.get(checkUserQuery)

  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'Secret_Token')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const changeDBForLatestTweets = dbObject => {
  return {
    username: dbObject.username,
    tweet: dbObject.tweet,
    dateTime: dbObject.dateTime,
  }
}

const changeDBForFollowingNames = dbObject => {
  return {
    "name": dbObject.name,
  }
}

const changeDBForSpecificTweetId = dbObject => {
  return {
    tweet: dbObject.tweet,
    likes: dbObject['COUNT(like.like_id)'],
    replies: dbObject['COUNT(reply.reply_id)'],
    dateTime: dbObject.date_time,
  }
}
const changeDBForSpecificTweetIdNames = dbObject => {
  return {
    likes: dbObject,
  }
}

const changeApi8 = dbObject => {
  return {
    name: dbObject.user.name,
    reply: dbObject.reply.reply,
  }
}

const changeDBForSpecificTweetIdNamesAndReplies = dbObject => {
  return {
    replies: dbObject,
  }
}

// API 3
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  let { username } = request;
  const userId = `SELECT user_id FROM user WHERE username = '${username}'; `;
  const getLatestTweet = `
    SELECT
    user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM
    follower
    INNER JOIN tweet
    ON follower.following_user_id = tweet.user_id
    INNER JOIN user
    ON tweet.user_id = user.user_id
    WHERE
    follower.follower_user_id = ${userId}
    ORDER BY
    tweet.date_time DESC
    LIMIT 4;`;
    
  const latestTweets = await db.all(getLatestTweet)
  response.send(latestTweets.map(eachItem => changeDBForLatestTweets(eachItem)))
})

// API 4
app.get('/user/following/', authenticateToken, async (request, response) => {
  let { username } = request;
  const userId = `SELECT user_id FROM user WHERE username = '${username}'; `;
  const getNameQuery = `
    SELECT user.name
    FROM user INNER JOIN follower
    ON user.user_id = follower.following_user_id
    WHERE follower.follower_id = ${userId};
  `

  const followingNames = await db.all(getNameQuery)
  response.send(
    followingNames.map(eachItem => changeDBForFollowingNames(eachItem)),
  )
})

// API 5
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const getNameQuery = `
    SELECT user.name
    FROM user INNER JOIN follower
    ON user.user_id = follower.follower_user_id;
  `

  const followerNames = await db.all(getNameQuery)
  response.send(
    followerNames.map(eachItem => changeDBForFollowingNames(eachItem))
  )
})

// API 6
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const getTweetQuery = `
    SELECT 
      tweet.tweet,
      COUNT(like.like_id),
      COUNT(reply.reply_id),
      tweet.date_time
    FROM tweet INNER JOIN like
    ON tweet.tweet_id = like.tweet_id
    INNER JOIN reply
    ON tweet.tweet_id = like.tweet_id
    WHERE tweet.tweet_id = ${tweetId}
    GROUP BY like.like_id, reply.reply_id;
  `

  const tweetDetails = await db.get(getTweetQuery)

  if (tweetDetails === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    response.send(changeDBForSpecificTweetId(tweetDetails))
  }
})

// API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const getNameQuery = `
    SELECT 
      user.name
    FROM tweet INNER JOIN follower
    ON tweet.tweet_id = follower.following_user_id
    INNER JOIN user
    ON user.user_id = follower.following_user_id
    WHERE tweet.tweet_id = ${tweetId};
  `

    const namesList = await db.all(getNameQuery)

    if (namesList === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send(changeDBForSpecificTweetIdNames(namesList))
    }
  },
)

// API 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const getNameQuery = `
    SELECT 
      user.name,
      reply.reply
    FROM tweet INNER JOIN follower
    ON tweet.tweet_id = follower.following_user_id
    INNER JOIN user
    ON user.user_id = follower.following_user_id
    INNER JOIN reply 
    ON reply.tweet_id = follower.following_user_id
    WHERE tweet.tweet_id = ${tweetId};
  `

    const namesList = await db.all(getNameQuery)
    const nameAndReplyArray = namesList.map(eachItem => changeApi8(eachItem))

    if (namesList === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send(
        changeDBForSpecificTweetIdNamesAndReplies(nameAndReplyArray),
      )
    }
  },
)

// API 9
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const getAllTweetsQuery = `
    SELECT 
      tweet.tweet,
      COUNT(like.like_id),
      COUNT(reply.reply_id),
      tweet.date_time
    FROM user INNER JOIN tweet
    ON user.user_id = tweet.user_id
    INNER JOIN like ON like.user_id = user.user_id
    INNER JOIN reply ON reply.user_id = user.user_id;
  `

  const allTweets = await db.all(getAllTweetsQuery)
  response.send(allTweets.map(eachItem => changeDBForSpecificTweetId(eachItem)))
})

// API 10
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const postTweetQuery = `
    INSERT INTO 
      tweet (tweet)
    VALUES 
      (${tweet});  
  `

  await db.run(postTweetQuery)
  response.send('Created a Tweet')
})

// API 11
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params

    const deleteTweetQuery = `
    DELETE FROM tweet
    WHERE tweet_id = ${tweetId};
  `
    const deleteTweet = await db.run(deleteTweetQuery)
    if (deleteTweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
