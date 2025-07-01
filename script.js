import { InferenceClient } from "https://cdn.jsdelivr.net/npm/@huggingface/inference@4/+esm";
const { Application, Controller } = Stimulus;

class LanguageChatbotController extends Controller {
  static targets = [
    "messages",
    "micButton",
    "status",
    "apiSetup",
    "apiInput",
    "loading",
  ];

  connect() {
    this.currentLanguage = "pl-PL";
    this.isRecording = false;
    this.isProcessing = false;

    this.apiKey = null;
    this.model = "meta-llama/Meta-Llama-3.1-8B-Instruct";
    this.hf = null;

    // Wymagaj wprowadzenia klucza przed rozpoczęciem
    this.apiSetupTarget.classList.add("show");
    this.micButtonTarget.classList.add("disabled");
    this.statusTarget.textContent = "Skonfiguruj API, aby rozpocząć";

    if (this.apiKey) {
      this.hfTranslationClient = new InferenceClient(this.apiKey);
    }

    this.translationModels = {
      "pl-PL": "Helsinki-NLP/opus-mt-pl-en", // polski -> angielski
      "en-US": "Helsinki-NLP/opus-mt-en-pl", // angielski -> polski
      "es-ES": "Helsinki-NLP/opus-mt-es-en",
      "fr-FR": "Helsinki-NLP/opus-mt-fr-en",
      "de-DE": "Helsinki-NLP/opus-mt-de-en",
    };

    if (
      !("webkitSpeechRecognition" in window) &&
      !("SpeechRecognition" in window)
    ) {
      this.addErrorMessage(
        "Twoja przeglądarka nie obsługuje Web Speech API. Użyj Chrome lub Edge."
      );
      return;
    }
    if (!("speechSynthesis" in window)) {
      this.addErrorMessage(
        "Twoja przeglądarka nie obsługuje funkcji odczytu tekstu."
      );
      return;
    }

    this.initializeSpeechRecognition();
    this.loadVoices();
  }

  async chatCompletion(userInput) {
    const languageInstructions = {
      "pl-PL":
        "Odpowiadaj TYLKO po polsku. Jesteś pomocnym asystentem do nauki języka polskiego.",
      "en-US":
        "Respond ONLY in English. You are a helpful English language learning assistant.",
      "es-ES":
        "Responde SOLO en español. Eres un asistente útil para aprender español.",
      "fr-FR":
        "Réponds SEULEMENT en français. Tu es un assistant utile pour apprendre le français.",
      "de-DE":
        "Antworte NUR auf Deutsch. Du bist ein hilfreicher Assistent zum Deutschlernen.",
    };

    const systemPrompt = languageInstructions[this.currentLanguage];
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userInput },
    ];

    const response = await this.hf.chatCompletion({
      model: this.model,
      messages,
      max_tokens: 256,
      temperature: 0.7,
    });

    return response.choices[0].message.content.trim();
  }

  saveApiKey() {
    const apiKey = this.apiInputTarget.value.trim();
    if (!apiKey) {
      this.addErrorMessage("Proszę wprowadzić klucz API.");
      return;
    }

    this.apiKey = apiKey;
    this.hf = new InferenceClient(apiKey);

    this.apiSetupTarget.classList.remove("show");
    this.micButtonTarget.classList.remove("disabled");
    this.statusTarget.textContent = "Kliknij mikrofon i zacznij mówić";

    this.addBotMessage(
      "Świetnie! Klucz API został zapisany w pamięci. Możesz rozpocząć rozmowę."
    );
  }

  async processUserInput(text) {
    this.isProcessing = true;
    this.statusTarget.textContent = "🧠 Myślę...";
    this.statusTarget.classList.add("processing");
    this.loadingTarget.classList.add("show");

    try {
      const botReply = await this.chatCompletion(text);
      this.addBotMessage(botReply);
      this.speakText(botReply);
    } catch (err) {
      console.error(err);
      this.addErrorMessage(
        "Przepraszam, wystąpił błąd podczas przetwarzania Twojej wiadomości. Spróbuj ponownie."
      );
    } finally {
      this.isProcessing = false;
      this.statusTarget.classList.remove("processing");
      this.statusTarget.textContent = "Kliknij mikrofon i zacznij mówić";
      this.loadingTarget.classList.remove("show");
    }
  }

  initializeSpeechRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = this.currentLanguage;

    this.recognition.onstart = () => {
      this.isRecording = true;
      this.micButtonTarget.classList.add("recording");
      this.statusTarget.textContent = "🎤 Słucham...";
      this.statusTarget.classList.add("recording");
    };

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      this.addUserMessage(transcript);
      this.processUserInput(transcript);
    };

    this.recognition.onerror = (event) => {
      this.stopRecording();
      if (event.error === "not-allowed") {
        this.addErrorMessage(
          "Dostęp do mikrofonu został odrzucony. Sprawdź ustawienia przeglądarki."
        );
      } else {
        this.addErrorMessage(`Błąd rozpoznawania mowy: ${event.error}`);
      }
    };

    this.recognition.onend = () => this.stopRecording();
  }

  async fetchTranslation(word) {
    if (!this.apiKey || !this.hf) {
      // Brak klucza API lub klienta - zwróć słowo bez zmian
      return word;
    }

    // Wybierz model na podstawie obecnego języka
    const model =
      this.translationModels[this.currentLanguage] ||
      "Helsinki-NLP/opus-mt-pl-en";

    try {
      // Wywołanie API Hugging Face - model tłumaczenia
      const response = await this.hf.textGeneration({
        model,
        inputs: word,
        parameters: {
          max_new_tokens: 60,
          do_sample: false,
          temperature: 0,
        },
      });

      // Oczekujemy, że odpowiedź to tablica obiektów z generated_text
      if (
        Array.isArray(response) &&
        response.length > 0 &&
        response[0].generated_text
      ) {
        // Wygenerowany tekst może zawierać oryginalne słowo + tłumaczenie, więc wyciągamy tłumaczenie:
        // Najprościej: usuń oryginalne słowo z początku i przytnij whitespace
        let translated = response[0].generated_text;
        if (translated.toLowerCase().startsWith(word.toLowerCase())) {
          translated = translated.slice(word.length).trim();
        }
        return translated || word;
      }

      return word;
    } catch (error) {
      console.error("Błąd tłumaczenia:", error);
      return word; // na wypadek błędu zwracamy oryginał
    }
  }

  async fetchTranslation(word) {
    if (!this.apiKey || !this.hf) {
      // Brak klucza API lub klienta - zwróć słowo bez zmian
      return word;
    }

    // Wybierz model na podstawie obecnego języka
    const model =
      this.translationModels[this.currentLanguage] ||
      "Helsinki-NLP/opus-mt-pl-en";

    try {
      // Wywołanie API Hugging Face - model tłumaczenia
      const response = await this.hf.textGeneration({
        model,
        inputs: word,
        parameters: {
          max_new_tokens: 60,
          do_sample: false,
          temperature: 0,
        },
      });

      // Oczekujemy, że odpowiedź to tablica obiektów z generated_text
      if (
        Array.isArray(response) &&
        response.length > 0 &&
        response[0].generated_text
      ) {
        // Wygenerowany tekst może zawierać oryginalne słowo + tłumaczenie, więc wyciągamy tłumaczenie:
        // Najprościej: usuń oryginalne słowo z początku i przytnij whitespace
        let translated = response[0].generated_text;
        if (translated.toLowerCase().startsWith(word.toLowerCase())) {
          translated = translated.slice(word.length).trim();
        }
        return translated || word;
      }

      return word;
    } catch (error) {
      console.error("Błąd tłumaczenia:", error);
      return word; // na wypadek błędu zwracamy oryginał
    }
  }

  toggleRecording() {
    if (!this.apiKey) {
      this.addErrorMessage("Najpierw skonfiguruj klucz API.");
      return;
    }
    if (this.isProcessing) return;

    if (this.isRecording) {
      this.recognition.stop();
    } else {
      try {
        this.recognition.start();
      } catch (e) {
        this.addErrorMessage(
          "Nie można rozpocząć nagrywania. Spróbuj ponownie."
        );
      }
    }
  }

  stopRecording() {
    this.isRecording = false;
    this.micButtonTarget.classList.remove("recording");
    this.statusTarget.classList.remove("recording");
    this.statusTarget.textContent = "Kliknij mikrofon i zacznij mówić";
  }

  loadVoices() {
    this.voices = speechSynthesis.getVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => {
        this.voices = speechSynthesis.getVoices();
      };
    }
  }

  speakText(text) {
    if (!("speechSynthesis" in window)) return;

    this.statusTarget.textContent = "🔊 Mówię...";
    this.statusTarget.classList.add("speaking");

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = this.voices.find((v) =>
      v.lang.startsWith(this.currentLanguage.split("-")[0])
    );
    if (voice) utterance.voice = voice;

    utterance.lang = this.currentLanguage;
    utterance.rate = 0.8;
    utterance.pitch = 1;

    utterance.onend = () => {
      this.statusTarget.classList.remove("speaking");
      this.statusTarget.textContent = "Kliknij mikrofon i zacznij mówić";
    };

    speechSynthesis.speak(utterance);
  }

  setLanguage(event) {
    const selectedBtn = event.currentTarget;
    const lang = selectedBtn.dataset.lang;

    this.currentLanguage = lang;

    // Ustaw język w rozpoznawaniu mowy, jeśli już zainicjalizowane
    if (this.recognition) {
      this.recognition.lang = this.currentLanguage;
    }

    // Zaktualizuj styl aktywnego przycisku
    const buttons = selectedBtn.parentElement.querySelectorAll(".language-btn");
    buttons.forEach((btn) => btn.classList.remove("active"));
    selectedBtn.classList.add("active");

    // Komunikat informujący o zmianie języka
    const messages = {
      "pl-PL": "✅ Język został zmieniony na: polski.",
      "en-US": "✅ Language switched to: English.",
      "es-ES": "✅ Idioma cambiado a: español.",
      "fr-FR": "✅ Langue changée en : français.",
      "de-DE": "✅ Sprache wurde geändert zu: Deutsch.",
    };

    this.addBotMessage(messages[lang] || "✅ Zmieniono język.");
  }

  addUserMessage(text) {
    const msg = this.createMessageElement("user", text);
    this.messagesTarget.appendChild(msg);
    this.scrollToBottom();
  }

  onWordClick(event, word) {
    event.stopPropagation();

    // Usuń istniejący popup jeśli jest
    const existingPopup = this.element.querySelector(".word-popup");
    if (existingPopup) existingPopup.remove();

    // Tworzymy popup z tłumaczeniem i gwiazdką
    const popup = document.createElement("div");
    popup.className = "word-popup";
    popup.style.position = "absolute";
    popup.style.background = "#fff";
    popup.style.border = "1px solid #ccc";
    popup.style.padding = "8px";
    popup.style.borderRadius = "5px";
    popup.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    popup.style.zIndex = 1000;
    popup.style.minWidth = "150px";

    // Tłumaczenie (można tu podpiąć API tłumaczenia)
    const translationText = document.createElement("div");
    translationText.textContent = "Tłumaczenie: ..."; // Później uzupełnimy

    // Gwiazdka do zaznaczenia ulubionego
    const starBtn = document.createElement("button");
    starBtn.textContent = this.isStarred(word) ? "★" : "☆";
    starBtn.style.fontSize = "20px";
    starBtn.style.border = "none";
    starBtn.style.background = "transparent";
    starBtn.style.cursor = "pointer";
    starBtn.title = "Dodaj do ulubionych";

    starBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleStar(word);
      starBtn.textContent = this.isStarred(word) ? "★" : "☆";
    });

    popup.appendChild(translationText);
    popup.appendChild(starBtn);

    this.element.appendChild(popup);

    // Pozycjonowanie popupu pod klikniętym słowem
    const rect = event.target.getBoundingClientRect();
    const containerRect = this.element.getBoundingClientRect();

    popup.style.top = `${
      rect.bottom - containerRect.top + window.scrollY + 5
    }px`;
    popup.style.left = `${rect.left - containerRect.left + window.scrollX}px`;

    // Pobierz tłumaczenie słowa
    this.fetchTranslation(word).then((trans) => {
      translationText.textContent = `Tłumaczenie: ${trans}`;
    });

    // Zamknij popup po kliknięciu poza popupem
    const onClickOutside = (ev) => {
      if (!popup.contains(ev.target)) {
        popup.remove();
        document.removeEventListener("click", onClickOutside);
      }
    };
    document.addEventListener("click", onClickOutside);
  }

  getStarredWords() {
    const data = localStorage.getItem("starredWords");
    return data ? JSON.parse(data) : [];
  }

  isStarred(word) {
    const starred = this.getStarredWords();
    return starred.includes(word.toLowerCase());
  }

  toggleStar(word) {
    let starred = this.getStarredWords();
    const wordLower = word.toLowerCase();

    if (starred.includes(wordLower)) {
      starred = starred.filter((w) => w !== wordLower);
    } else {
      starred.push(wordLower);
    }

    localStorage.setItem("starredWords", JSON.stringify(starred));
  }

  async fetchTranslation(word) {
    // TODO: podpiąć API tłumaczenia, np. Hugging Face Translation lub inne
  }

  addBotMessage(text) {
    const msg = document.createElement("div");
    msg.className = "message bot";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = "🤖";

    const content = document.createElement("div");
    content.className = "message-content";

    // Podziel tekst na słowa i renderuj je jako klikane spany
    const words = text.split(/(\s+)/); // zachowujemy spacje
    words.forEach((word) => {
      if (word.trim().length === 0) {
        content.appendChild(document.createTextNode(word));
        return;
      }

      const span = document.createElement("span");
      span.className = "translatable-word";
      span.textContent = word;
      span.style.cursor = "pointer";
      span.addEventListener("click", (e) => this.onWordClick(e, word));
      content.appendChild(span);
    });

    msg.appendChild(avatar);
    msg.appendChild(content);

    this.messagesTarget.appendChild(msg);
    this.scrollToBottom();
  }

  addErrorMessage(text) {
    const errorBox = document.createElement("div");
    errorBox.className = "error";
    errorBox.textContent = text;
    this.messagesTarget.appendChild(errorBox);
    this.scrollToBottom();
  }

  createMessageElement(role, text) {
    const message = document.createElement("div");
    message.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = role === "user" ? "🧑" : "🤖";

    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = text;

    message.appendChild(avatar);
    message.appendChild(content);

    return message;
  }

  scrollToBottom() {
    this.messagesTarget.scrollTop = this.messagesTarget.scrollHeight;
  }

  clearChat() {
    this.messagesTarget.innerHTML = "";
    this.addBotMessage("🧹 Czatu wyczyszczony. Możesz zacząć od nowa.");
  }
}

const app = Application.start();
app.register("language-chatbot", LanguageChatbotController);
