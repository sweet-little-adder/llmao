const { MongoClient } = require('mongodb');
const readline = require('readline');
const https = require('https');
const http = require('http');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m'
};

// Helper function to colorize text
function colorize(text, color) {
  return `${color}${text}${colors.reset}`;
}

// Function to format code blocks
function formatCodeBlocks(text) {
  // Get terminal width (default to 80 if not available)
  const terminalWidth = process.stdout.columns || 80;
  const maxCodeWidth = Math.max(terminalWidth - 4, 40); // Leave minimal margin
  
  // Split text by code block markers
  const parts = text.split(/(```[\w]*\n[\s\S]*?```)/g);
  
  return parts.map(part => {
    // Check if this is a code block
    const codeBlockMatch = part.match(/```(\w*)\n([\s\S]*?)```/);
    
    if (codeBlockMatch) {
      const language = codeBlockMatch[1] || 'text';
      const code = codeBlockMatch[2];
      
      // Calculate optimal border length based on terminal width
      const maxLineLength = Math.max(...code.split('\n').map(line => line.length));
      const minBorderLength = Math.max(maxLineLength + 8, language.length + 12);
      const borderLength = Math.min(minBorderLength, maxCodeWidth);
      
      // Create borders that adapt to terminal width
      const topBorder = '┌' + '─'.repeat(borderLength - 2) + '┐';
      const languageBar = '│ ' + colorize(language.toUpperCase(), colors.cyan) + ' '.repeat(borderLength - language.length - 4) + ' │';
      const separator = '├' + '─'.repeat(borderLength - 2) + '┤';
      
      // Handle line wrapping for long lines with better word breaking
      const codeLines = [];
      code.split('\n').forEach(line => {
        if (line.length <= borderLength - 4) {
          // Line fits within the border
          const padding = ' '.repeat(borderLength - line.length - 4);
          codeLines.push('│ ' + colorize(line, colors.white) + padding + ' │');
        } else {
          // Line needs to be wrapped - try to break at spaces first
          let remainingLine = line;
          while (remainingLine.length > 0) {
            let chunk = remainingLine.substring(0, borderLength - 4);
            
            // If we're not at the end and the chunk doesn't end with a space,
            // try to break at the last space
            if (remainingLine.length > borderLength - 4 && !chunk.endsWith(' ')) {
              const lastSpace = chunk.lastIndexOf(' ');
              if (lastSpace > borderLength - 8) { // Only break if we have enough content
                chunk = chunk.substring(0, lastSpace);
                remainingLine = remainingLine.substring(lastSpace + 1);
              } else {
                remainingLine = remainingLine.substring(borderLength - 4);
              }
            } else {
              remainingLine = remainingLine.substring(borderLength - 4);
            }
            
            const padding = ' '.repeat(borderLength - chunk.length - 4);
            codeLines.push('│ ' + colorize(chunk, colors.white) + padding + ' │');
          }
        }
      });
      
      const bottomBorder = '└' + '─'.repeat(borderLength - 2) + '┘';
      
      return '\n' + colorize(topBorder, colors.gray) + '\n' +
             colorize(languageBar, colors.gray) + '\n' +
             colorize(separator, colors.gray) + '\n' +
             codeLines.join('\n') + '\n' +
             colorize(bottomBorder, colors.gray) + '\n';
    }
    
    return part;
  }).join('');
}

async function main() {
  let client;
  
  try {
    // Connect to MongoDB
    console.log(colorize('🔗 Connecting to MongoDB...', colors.cyan));
    client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    console.log(colorize('✅ Connected to MongoDB', colors.green));
    
    const db = client.db('chatdb');
    const collection = db.collection('chats');

    // Create a readline interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Chat loop
    let conversationId;
    let userName;
    let conversationHistory = [];
    
    // Get user name
    userName = await new Promise((resolve) => {
      rl.question(colorize('👤 Enter your name: ', colors.yellow), (name) => {
        resolve(name);
      });
    });
    
    console.log(colorize(`\n🎉 Hello, ${userName}!`, colors.green));
    console.log(colorize('🤖 Connecting to LM Studio (Llama 3.3-70B)...', colors.cyan));
    
    // Use a consistent conversation ID based on username
    conversationId = `chat_${userName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    
    // Load existing conversation history
    await loadConversationHistory();

    // Function to load conversation history from MongoDB
    async function loadConversationHistory() {
      try {
        const history = await collection.find({ 
          conversationId: conversationId 
        }).sort({ timestamp: 1 }).toArray();
        
        // Convert MongoDB documents to chat format
        conversationHistory = history.map(msg => ({
          role: msg.role,
          content: msg.text
        }));
        
        console.log(colorize(`📚 Loaded ${conversationHistory.length} previous messages`, colors.cyan));
      } catch (error) {
        console.log(colorize('⚠️  Could not load conversation history', colors.yellow));
        conversationHistory = [];
      }
    }

    // Function to extract key information from conversation history
    function extractUserInfo(history) {
      const userMessages = history.filter(msg => msg.role === 'user');
      let userInfo = '';
      
      // Look for name-related information
      userMessages.forEach(msg => {
        if (msg.content.toLowerCase().includes('name is') || msg.content.toLowerCase().includes('my name')) {
          userInfo += `User mentioned: ${msg.content}\n`;
        }
      });
      
      return userInfo;
    }

    // Function to send request to LM Studio API with conversation history
    async function sendToLMStudio(message) {
      return new Promise((resolve, reject) => {
        // Extract key user information
        const userInfo = extractUserInfo(conversationHistory);
        
        // Build messages array with conversation history
        const messages = [
          // Add a system message to give context
          {
            role: "system",
            content: `You are having a conversation with ${userName}. You have access to the conversation history and should use it to provide more personalized and contextual responses. Remember details about the user and previous topics discussed. IMPORTANT: If the user has mentioned their name or personal details in previous messages, you should remember and reference this information.

${userInfo ? `Key information about the user:\n${userInfo}` : ''}`
          },
          // Add conversation history (limit to last 10 messages to keep context focused)
          ...conversationHistory.slice(-10),
          // Add current message
          {
            role: "user",
            content: message
          }
        ];

        // Debug: Log the messages being sent
        console.log(colorize(`📤 Sending ${messages.length} messages to LM Studio`, colors.gray));
        console.log(colorize(`📝 Conversation history: ${conversationHistory.length} messages`, colors.gray));

        const postData = JSON.stringify({
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000,
          stream: false
        });

        const options = {
          hostname: 'localhost',
          port: 1234,
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const req = http.request(options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              const response = JSON.parse(data);
              if (response.choices && response.choices[0] && response.choices[0].message) {
                resolve(response.choices[0].message.content);
              } else {
                console.log(colorize('⚠️  Unexpected response structure:', colors.yellow));
                console.log(colorize('Response keys:', colors.gray), Object.keys(response));
                if (response.choices) {
                  console.log(colorize('Choices structure:', colors.gray), response.choices);
                }
                reject(new Error('Invalid response format from LM Studio'));
              }
            } catch (error) {
              console.log(colorize('❌ JSON parse error:', colors.red), error.message);
              console.log(colorize('Raw response:', colors.gray), data);
              reject(error);
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.write(postData);
        req.end();
      });
    }

    // Chat loop
    async function chatLoop() {
      const input = await new Promise((resolve) => {
        rl.question(colorize('\n💬: ', colors.blue), (userInput) => {
          resolve(userInput);
        });
      });

      if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'exit') {
        console.log(colorize('\n👋 Goodbye!', colors.green));
        rl.close();
        return;
      }

      // Special command to load conversation history
      if (input.toLowerCase() === 'history' || input.toLowerCase() === 'load') {
        await loadConversationHistory();
        console.log(colorize('📚 Conversation history loaded!', colors.green));
        chatLoop();
        return;
      }

      // Special command to start new conversation
      if (input.toLowerCase() === 'new' || input.toLowerCase() === 'reset') {
        conversationId = `chat_${userName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}`;
        conversationHistory = [];
        console.log(colorize('🆕 Started new conversation!', colors.green));
        chatLoop();
        return;
      }

      try {
        // Save user message to MongoDB
        const userMessage = { 
          text: input, 
          sender: userName, 
          timestamp: new Date(), 
          conversationId,
          role: 'user'
        };
        
        const userResult = await collection.insertOne(userMessage);
        console.log(colorize(`message ID ${userResult.insertedId}`, colors.gray));
        
        // Add to conversation history
        conversationHistory.push({
          role: 'user',
          content: input
        });
        
        // Get response from LM Studio
        console.log(colorize('🤔 Waiting for Llama 3.3-70B response...', colors.yellow));
        const aiResponse = await sendToLMStudio(input);
        
        // Display AI response with nice formatting and code blocks
        console.log(colorize('\n🤖 Llama 3.3-70B:', colors.magenta));
        console.log(colorize('─'.repeat(50), colors.gray));
        
        // Format the response with code blocks
        const formattedResponse = formatCodeBlocks(aiResponse);
        console.log(colorize(formattedResponse, colors.cyan));
        
        console.log(colorize('─'.repeat(50), colors.gray));
        
        // Save AI response to MongoDB
        const aiMessage = { 
          text: aiResponse, 
          sender: 'Llama 3.3-70B', 
          timestamp: new Date(), 
          conversationId,
          role: 'assistant'
        };
        
        const aiResult = await collection.insertOne(aiMessage);
        console.log(colorize(`💾 AI response ID ${aiResult.insertedId}`, colors.gray));
        
        // Add to conversation history
        conversationHistory.push({
          role: 'assistant',
          content: aiResponse
        });
        
        // Continue the chat loop
        chatLoop();
        
      } catch (error) {
        console.error(colorize('❌ Error:', colors.red), error.message);
        if (error.code === 'ECONNREFUSED') {
          console.log(colorize('❌ Cannot connect to LM Studio. Make sure:', colors.red));
          console.log(colorize('   1. LM Studio is running', colors.yellow));
          console.log(colorize('   2. The Llama 3.3-70B model is loaded', colors.yellow));
          console.log(colorize('   3. Local server is enabled on port 1234', colors.yellow));
          console.log(colorize('   4. Go to Settings > Local Server in LM Studio', colors.yellow));
        }
        chatLoop();
      }
    }

    // Start the chat loop
    chatLoop();

    // Close the readline interface and MongoDB connection when finished
    rl.on('close', async () => {
      if (client) {
        await client.close();
        console.log(colorize('🔌 MongoDB connection closed', colors.cyan));
      }
      process.exit(0);
    });

  } catch (error) {
    console.error(colorize('❌ Error connecting to MongoDB:', colors.red), error);
    if (client) {
      await client.close();
    }
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log(colorize('\n⚠️  Received SIGINT. Shutting down gracefully...', colors.yellow));
  process.exit(0);
});

// Handle terminal resize events
process.stdout.on('resize', () => {
  const newWidth = process.stdout.columns || 80;
  console.log(colorize(`\n📏 Terminal resized to ${newWidth} columns`, colors.gray));
});

// Run the main function
main().catch(console.error);