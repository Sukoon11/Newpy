const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const logger = require('console-log-level')({ level: 'info' });
const token = '7279695237:AAFbgOrj3orOD4oVJ6mZgw4juvK0dkzE23U';  // Replace with your actual bot token
const API_URL = 'https://api.51gameapi.com/api/webapi/GetEmerdList';

const bot = new TelegramBot(token, { polling: true });
const userStates = {};

// Start command handler
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `
        <b>🎉 Welcome to the Prediction Bot! 🎉</b>\n\n
        <b>Simply send a number (0-9) to start receiving predictions. 
        I'll automatically detect your last drawn number and give you predictions based on that. 
        To begin, use the command: /predict <number></b>.`;
    
    bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'HTML' });
});

// Fetch data from the API
async function fetchData() {
    const requestData = {
        typeId: 1,
        language: 0,
        random: 'c5acbc8a25b24da1a9ddd084e17cb8b6',
        signature: '667FC72C2C362975B4C56CACDE81540C',
        timestamp: Math.floor(Date.now() / 1000),
    };

    const headers = {
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json, text/plain, */*',
        'Authorization': 'Bearer YOUR_API_TOKEN_HERE',  // Replace with your actual API token
    };

    try {
        const response = await axios.post(API_URL, requestData, { headers });
        return response.data;
    } catch (error) {
        logger.error(`Error fetching data: ${error.message}`);
        return { error: error.message };
    }
}

// Predict command handler
bot.onText(/\/predict (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const lastDrawnNumber = parseInt(match[1], 10);
    const userId = msg.from.id;

    if (isNaN(lastDrawnNumber) || lastDrawnNumber < 0 || lastDrawnNumber > 9) {
        return bot.sendMessage(chatId, "<b>Please provide a valid number between 0 and 9.</b>", { parse_mode: 'HTML' });
    }

    // Initialize user state if not present
    if (!userStates[userId]) {
        userStates[userId] = { category: 'BIG', lastLoss: false };
    }

    const apiData = await fetchData();

    if (apiData.error) {
        return bot.sendMessage(chatId, `<b>Error fetching data:</b> ${apiData.error}`, { parse_mode: 'HTML' });
    }

    await generatePrediction(chatId, apiData, lastDrawnNumber, userId);
});

// Generate prediction
async function generatePrediction(chatId, data, lastDrawnNumber, userId) {
    let numberScores = new Array(10).fill(0);
    const drawnHistory = [5, 8, 8, 9, 3]; // Example history

    // Adjust scores based on drawn history
    drawnHistory.forEach((number, index) => {
        if (index < drawnHistory.length - 3) {
            numberScores[number] += 1;
        } else {
            numberScores[number] -= 1;
        }
    });

    numberScores[lastDrawnNumber] += 5;

    // Get frequency and missing data
    const frequencyData = data.data.find(item => item.typeName === "Frequency") || {};
    const missingData = data.data.find(item => item.typeName === "Missing") || {};

    for (let i = 0; i < 10; i++) {
        numberScores[i] += (missingData[`number_${i}`] || 0) * 2;
        numberScores[i] += (10 - (frequencyData[`number_${i}`] || 0));
    }

    // Sort the top predictions
    const rankedPredictions = numberScores
        .map((score, i) => ({ number: i, score }))
        .filter(pred => pred.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 7); // Get top 7 numbers

    // Count small and big numbers in top predictions
    const smallCount = rankedPredictions.filter(pred => pred.number <= 4).length;
    const bigCount = rankedPredictions.filter(pred => pred.number >= 5).length;

    // Determine prediction category
    if (userStates[userId].lastLoss) {
        userStates[userId].category = userStates[userId].category === 'BIG' ? 'SMALL' : 'BIG';
        userStates[userId].lastLoss = false; // Reset the loss flag
    } else {
        userStates[userId].category = smallCount > bigCount ? 'SMALL' : 'BIG';
    }

    const category = userStates[userId].category;

    // Build output message with the prediction numbers
    let output = `<b>🎯 Prediction Based on Last Number ${lastDrawnNumber}:</b>\n\n<b>Top Predicted Numbers:</b>\n`;
    
    rankedPredictions.forEach((pred, index) => {
        const sizeLabel = pred.number >= 5 ? 'Big' : 'Small';
        output += `${index + 1}. <b>${pred.number} (${sizeLabel})</b>\n`;
    });

    output += `\n<b>➡️ Prediction Bet on :</b> ${category}`;

    // Create Win/Loss buttons
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "Win", callback_data: `win_${userId}` },
                    { text: "Change Pre🔁", callback_data: `loss_${userId}` }
                ]
            ]
        }
    };

    bot.sendMessage(chatId, output, { parse_mode: 'HTML', reply_markup: keyboard });
}

// Callback query handler for Win/Loss buttons
bot.on('callback_query', (query) => {
    const userId = parseInt(query.data.split('_')[1], 10);
    const action = query.data.split('_')[0];

    // Check if user_id exists in userStates, if not, initialize it
    if (!userStates[userId]) {
        userStates[userId] = { category: 'BIG', lastLoss: false };
    }

    if (action === 'win') {
        bot.answerCallbackQuery(query.id, { text: "Win, Congratulations 🎉." });
    } else if (action === 'loss') {
        userStates[userId].lastLoss = true;
        bot.answerCallbackQuery(query.id, { text: "Next prediction will switch." });
    }
});
