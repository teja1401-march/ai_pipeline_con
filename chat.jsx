import { useEffect, useRef, useState } from "react";

function cleanText(text) {
  return text
    // Remove headings
    .replace(/^#{1,6}\s*/gm, "")

    // Remove bold
    .replace(/\*\*(.*?)\*\*/g, "$1")

    // Remove italic
    .replace(/\*(.*?)\*/g, "$1")

    // Remove underline/bold
    .replace(/__(.*?)__/g, "$1")

    // Remove underline/italic
    .replace(/_(.*?)_/g, "$1")

    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")

    // Remove bullet points
    .replace(/^\s*[-*+]\s+/gm, "")

    // Remove numbered list formatting
    .replace(/^\s*\d+\.\s+/gm, "")

    // Remove markdown links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")

    // Remove decorative symbols
    .replace(/[•●○◆◇■□▪▫]/g, "")

    // Remove horizontal lines
    .replace(/^\s*([-*_]){3,}\s*$/gm, "")

    // Clean extra spaces
    .replace(/[ \t]+/g, " ")

    // Clean extra blank lines
    .replace(/\n{3,}/g, "\n\n")

    .trim();
}

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Speech queue
  const speechQueue = useRef([]);

  // Text waiting for a complete sentence
  const speechBuffer = useRef("");

  // Is speech currently playing?
  const isSpeaking = useRef(false);

  // ============================================
  // SPEAK NEXT SENTENCE
  // ============================================

  const speakNext = () => {
    if (isSpeaking.current) {
      return;
    }

    if (speechQueue.current.length === 0) {
      return;
    }

    const sentence = speechQueue.current.shift();

    if (!sentence || !sentence.trim()) {
      speakNext();
      return;
    }

    const cleanedSentence = cleanText(sentence);

    if (!cleanedSentence) {
      speakNext();
      return;
    }

    const utterance =
      new SpeechSynthesisUtterance(cleanedSentence);

    // 1X SPEED
    utterance.rate = 1;

    utterance.pitch = 1;
    utterance.volume = 1;

    isSpeaking.current = true;

    utterance.onend = () => {
      isSpeaking.current = false;

      // Speak next sentence immediately
      speakNext();
    };

    utterance.onerror = () => {
      isSpeaking.current = false;

      speakNext();
    };

    window.speechSynthesis.speak(utterance);
  };

  // ============================================
  // PROCESS STREAMING TEXT FOR SPEECH
  // ============================================

  const processSpeech = (text) => {
    speechBuffer.current += text;

    // Find complete sentences
    const sentenceRegex = /[^.!?]+[.!?]+/g;

    const sentences =
      speechBuffer.current.match(sentenceRegex);

    if (!sentences) {
      return;
    }

    sentences.forEach((sentence) => {
      const cleanedSentence = cleanText(sentence);

      if (cleanedSentence) {
        speechQueue.current.push(cleanedSentence);
      }
    });

    // Keep unfinished sentence
    const lastSentence =
      sentences[sentences.length - 1];

    const lastIndex =
      speechBuffer.current.lastIndexOf(lastSentence);

    speechBuffer.current =
      speechBuffer.current.substring(
        lastIndex + lastSentence.length
      );

    // Start speaking immediately
    speakNext();
  };

  // ============================================
  // SEND MESSAGE
  // ============================================

  const sendMessage = async () => {
    if (!input.trim() || loading) {
      return;
    }

    const userMessage = input.trim();

    setInput("");

    // Stop previous speech
    window.speechSynthesis.cancel();

    speechQueue.current = [];
    speechBuffer.current = "";
    isSpeaking.current = false;

    // Add user message
    // Add empty AI message
    setMessages((previousMessages) => [
      ...previousMessages,
      {
        role: "user",
        content: userMessage,
      },
      {
        role: "assistant",
        content: "",
      },
    ]);

    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:5000/api/chat",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            message: userMessage,
          }),
        }
      );

      if (!response.ok) {
        const errorText =
          await response.text();

        throw new Error(errorText);
      }

      if (!response.body) {
        throw new Error(
          "No streaming response received."
        );
      }

      const reader =
        response.body.getReader();

      const decoder =
        new TextDecoder();

      let completeText = "";

      // ========================================
      // READ STREAM
      // ========================================

      while (true) {
        const { value, done } =
          await reader.read();

        if (done) {
          break;
        }

        const chunk =
          decoder.decode(value, {
            stream: true,
          });

        if (!chunk) {
          continue;
        }

        // Add new generated text
        completeText += chunk;

        // ======================================
        // DISPLAY TEXT IMMEDIATELY
        // ======================================

        const displayText =
          cleanText(completeText);

        setMessages((previousMessages) => {
          const updatedMessages = [
            ...previousMessages,
          ];

          updatedMessages[
            updatedMessages.length - 1
          ] = {
            role: "assistant",
            content: displayText,
          };

          return updatedMessages;
        });

        // ======================================
        // SPEAK WHILE TEXT IS GENERATING
        // ======================================

        processSpeech(chunk);
      }

      // ========================================
      // SPEAK REMAINING TEXT
      // ========================================

      if (speechBuffer.current.trim()) {
        const remainingText =
          cleanText(speechBuffer.current);

        if (remainingText) {
          speechQueue.current.push(
            remainingText
          );
        }

        speechBuffer.current = "";

        speakNext();
      }

    } catch (error) {
      console.error(
        "CHAT ERROR:",
        error
      );

      setMessages((previousMessages) => {
        const updatedMessages = [
          ...previousMessages,
        ];

        updatedMessages[
          updatedMessages.length - 1
        ] = {
          role: "assistant",
          content:
            "Sorry, something went wrong.",
        };

        return updatedMessages;
      });

    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // ENTER KEY
  // ============================================

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();

      sendMessage();
    }
  };

  // ============================================
  // CLEANUP
  // ============================================

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // ============================================
  // USER INTERFACE
  // ============================================

  return (
    <div className="chat-container">

      <div className="chat-header">

        <h1>
          AI Conversation
        </h1>

        <span>
          Gemini AI
        </span>

      </div>

      <div className="messages-container">

        {messages.length === 0 && (
          <div className="welcome-message">

            <h2>
              How can I help you?
            </h2>

            <p>
              Ask me anything using text or voice.
            </p>

          </div>
        )}

        {messages.map(
          (message, index) => (
            <div
              key={index}
              className={`message ${
                message.role === "user"
                  ? "user-message"
                  : "assistant-message"
              }`}
            >

              <div className="message-label">

                {message.role === "user"
                  ? "You"
                  : "AI"}

              </div>

              <div className="message-content">

                {message.content}

              </div>

            </div>
          )
        )}

        {loading && (
          <div className="generating">
            AI is generating...
          </div>
        )}

      </div>

      <div className="input-area">

        <input
          type="text"
          placeholder="Ask anything..."
          value={input}
          onChange={(event) =>
            setInput(event.target.value)
          }
          onKeyDown={handleKeyDown}
          disabled={loading}
        />

        <button
          onClick={sendMessage}
          disabled={
            loading ||
            !input.trim()
          }
        >
          ➤
        </button>

      </div>

    </div>
  );
}

export default Chat;