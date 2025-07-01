import { HfInference } from "https://cdn.jsdelivr.net/npm/@huggingface/inference@2/+esm";

class LanguageChatbot {
  constructor() {
    this.currentLanguage = "pl-PL";
    this.isRecording = false;
    this.isProcessing = false;
    this.apiKey = null;
    this.apiProvider = "huggingface";
    this.hf = null;
    this.currentFlashcardIndex = 0;
    this.flashcardFlipped = false;
    this.correctAnswers = 0;

    this.translationModels = {
      "pl-PL": "Helsinki-NLP/opus-mt-pl-en",
      "en-US": "Helsinki-NLP/opus-mt-en-pl",
      "es-ES": "Helsinki-NLP/opus-mt-es-en",
      "fr-FR": "Helsinki-NLP/opus-mt-fr-en",
      "de-DE": "Helsinki-NLP/opus-mt-de-en",
    };

    this.initElements();
    this.initEvents();
    this.checkSpeechSupport();
    this.loadVoices();
    this.initializeSpeechRecognition();
    this.showPanel("chat");
    this.loadApiKey();
  }

  initElements() {
    // Chat elements
    this.messagesEl = document.getElementById("messages");
    this.textInputEl = document.getElementById("text-input");
    this.sendBtn = document.getElementById("send-btn");
    this.micBtn = document.getElementById("mic-btn");
    this.statusEl = document.getElementById("status");
    this.clearChatBtn = document.getElementById("clear-chat");
    this.loadingEl = document.getElementById("loading");

    // API setup elements
    this.apiSetupEl = document.getElementById("api-setup");
    this.apiProviderEl = document.getElementById("api-provider");
    this.apiInputEl = document.getElementById("api-input");
    this.apiSaveBtn = document.getElementById("api-save-btn");
    this.apiInfoHfEl = document.getElementById("api-info-hf");
    this.apiInfoOpenaiEl = document.getElementById("api-info-openai");

    // Navigation tabs
    this.tabChatBtn = document.getElementById("tab-chat");
    this.tabFavoritesBtn = document.getElementById("tab-favorites");
    this.tabFlashcardsBtn = document.getElementById("tab-flashcards");

    // Panels
    this.panelChat = document.getElementById("panel-chat");
    this.panelFavorites = document.getElementById("panel-favorites");
    this.panelFlashcards = document.getElementById("panel-flashcards");

    // Favorites elements
    this.favoritesList = document.getElementById("favorites-list");
    this.favoritesSearchEl = document.getElementById("favorites-search");
    this.exportFavoritesBtn = document.getElementById("export-favorites");
    this.clearFavoritesBtn = document.getElementById("clear-favorites");

    // Flashcards elements
    this.flashcardEl = document.getElementById("flashcard");
    this.flashcardEmptyEl = document.getElementById("flashcard-empty");
    this.cardWordEl = document.getElementById("card-word");
    this.cardTranslationEl = document.getElementById("card-translation");
    this.cardActionsEl = document.getElementById("card-actions");
    this.currentCardEl = document.getElementById("current-card");
    this.totalCardsEl = document.getElementById("total-cards");
    this.correctAnswersEl = document.getElementById("correct-answers");
    this.knowItBtn = document.getElementById("know-it");
    this.learningBtn = document.getElementById("learning");
    this.dontKnowBtn = document.getElementById("dont-know");
    this.shuffleBtn = document.getElementById("shuffle-flashcards");
    this.resetProgressBtn = document.getElementById("reset-progress");
    this.goToChatBtn = document.getElementById("go-to-chat");
  }

  initEvents() {
    // Chat events
    this.micBtn.addEventListener("click", () => this.toggleRecording());
    this.sendBtn.addEventListener("click", () => this.sendTextMessage());
    this.clearChatBtn.addEventListener("click", () => this.clearChat());

    // Text input events
    this.textInputEl.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendTextMessage();
      }
    });

    this.textInputEl.addEventListener("input", () => {
      this.autoResizeTextarea();
    });

    // API setup events
    this.apiSaveBtn.addEventListener("click", () => this.saveApiKey());
    this.apiProviderEl.addEventListener("change", () => this.toggleApiInfo());
    this.apiInputEl.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.saveApiKey();
      }
    });

    // Navigation events
    this.tabChatBtn.addEventListener("click", () => this.showPanel("chat"));
    this.tabFavoritesBtn.addEventListener("click", () => this.showPanel("favorites"));
    this.tabFlashcardsBtn.addEventListener("click", () => this.showPanel("flashcards"));

    // Favorites events
    this.favoritesSearchEl.addEventListener("input", () => this.filterFavorites());
    this.exportFavoritesBtn.addEventListener("click", () => this.exportFavorites());
    this.clearFavoritesBtn.addEventListener("click", () => this.clearAllFavorites());

    // Flashcards events
    this.flashcardEl.addEventListener("click", () => this.flipFlashcard());
    this.knowItBtn.addEventListener("click", () => this.answerFlashcard("correct"));
    this.learningBtn.addEventListener("click", () => this.answerFlashcard("learning"));
    this.dontKnowBtn.addEventListener("click", () => this.answerFlashcard("wrong"));
    this.shuffleBtn.addEventListener("click", () => this.shuffleFlashcards());
    this.resetProgressBtn.addEventListener("click", () => this.resetFlashcardProgress());
    this.goToChatBtn.addEventListener("click", () => this.showPanel("chat"));
  }

  loadApiKey() {
    const savedKey = sessionStorage.getItem("api_key");
    const savedProvider = sessionStorage.getItem("api_provider") || "huggingface";

    if (savedKey) {
      this.apiKey = savedKey;
      this.apiProvider = savedProvider;
      this.apiProviderEl.value = savedProvider;
      this.apiSetupEl.classList.remove("show");
      this.statusEl.textContent = "Kliknij mikrofon i zacznij mówić";
      this.micBtn.classList.remove("disabled");

      if (savedProvider === "huggingface") {
        this.hf = new HfInference(savedKey);
      }
    }
    this.toggleApiInfo();
  }

  saveApiKey() {
    const key = this.apiInputEl.value.trim();
    const provider = this.apiProviderEl.value;

    if (!key) {
      this.showNotification("Wprowadź klucz API", "error");
      return;
    }

    this.apiKey = key;
    this.apiProvider = provider;
    sessionStorage.setItem("api_key", key);
    sessionStorage.setItem("api_provider", provider);

    if (provider === "huggingface") {
      this.hf = new HfInference(key);
    }

    this.apiSetupEl.classList.remove("show");
    this.statusEl.textContent = "Kliknij mikrofon i zacznij mówić";
    this.micBtn.classList.remove("disabled");
    this.showNotification("Klucz API zapisany pomyślnie!", "success");
  }

  toggleApiInfo() {
    const provider = this.apiProviderEl.value;
    if (provider === "huggingface") {
      this.apiInfoHfEl.style.display = "block";
      this.apiInfoOpenaiEl.style.display = "none";
    } else {
      this.apiInfoHfEl.style.display = "none";
      this.apiInfoOpenaiEl.style.display = "block";
    }
  }

  showPanel(panelName) {
    // Hide all panels and deactivate all tabs
    document.querySelectorAll(".panel").forEach(panel => {
      panel.classList.remove("active");
    });
    document.querySelectorAll(".nav-tab").forEach(tab => {
      tab.classList.remove("active");
    });

    // Show selected panel and activate corresponding tab
    document.getElementById(`panel-${panelName}`).classList.add("active");
    document.getElementById(`tab-${panelName}`).classList.add("active");

    // Initialize specific panel functionality
    if (panelName === "favorites") {
      this.renderFavorites();
    } else if (panelName === "flashcards") {
      this.initFlashcards();
    }
  }

  autoResizeTextarea() {
    this.textInputEl.style.height = "auto";
    this.textInputEl.style.height = Math.min(this.textInputEl.scrollHeight, 120) + "px";
  }

  sendTextMessage() {
    const text = this.textInputEl.value.trim();
    if (text.length === 0) return;

    this.addUserMessage(text);
    this.textInputEl.value = "";
    this.autoResizeTextarea();
    this.processUserInput(text);
  }

  clearChat() {
    if (confirm("Czy na pewno chcesz wyczyścić całą rozmowę?")) {
      this.messagesEl.innerHTML = "";
    }
  }

  toggleRecording() {
    if (!this.apiKey) {
      this.showNotification("Najpierw skonfiguruj klucz API", "warning");
      return;
    }

    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  startRecording() {
    if (this.recognition) {
      this.recognition.start();
    }
  }

  stopRecording() {
    this.isRecording = false;
    this.micBtn.classList.remove("recording");
    this.statusEl.textContent = "Kliknij mikrofon i zacznij mówić";
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  checkSpeechSupport() {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      this.addErrorMessage("Twoja przeglądarka nie obsługuje Web Speech API. Użyj Chrome lub Edge.");
      this.micBtn.disabled = true;
    }
    if (!("speechSynthesis" in window)) {
      this.addErrorMessage("Twoja przeglądarka nie obsługuje funkcji odczytu tekstu.");
    }
  }

  initializeSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = this.currentLanguage;

    this.recognition.onstart = () => {
      this.isRecording = true;
      this.micBtn.classList.add("recording");
      this.statusEl.textContent = "🎤 Słucham...";
    };

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      this.addUserMessage(transcript);
      this.processUserInput(transcript);
    };

    this.recognition.onerror = (event) => {
      this.stopRecording();
      if (event.error === "not-allowed") {
        this.addErrorMessage("Dostęp do mikrofonu został odrzucony. Sprawdź ustawienia przeglądarki.");
      } else {
        this.addErrorMessage(`Błąd rozpoznawania mowy: ${event.error}`);
      }
    };

    this.recognition.onend = () => this.stopRecording();
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

    speechSynthesis.cancel();
    this.statusEl.textContent = "🔊 Mówię...";

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = this.voices.find(v => v.lang.startsWith(this.currentLanguage.split("-")[0]));
    if (voice) utterance.voice = voice;

    utterance.lang = this.currentLanguage;
    utterance.rate = 0.8;
    utterance.pitch = 1;

    utterance.onend = () => {
      this.statusEl.textContent = "Kliknij mikrofon i zacznij mówić";
    };

    utterance.onerror = () => {
      this.statusEl.textContent = "Błąd podczas odtwarzania mowy";
    };

    speechSynthesis.speak(utterance);
  }

  async processUserInput(text) {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.showLoading(true);

    try {
      let response;
      if (this.apiProvider === "huggingface") {
        response = await this.processWithHuggingFace(text);
      } else {
        response = await this.processWithOpenAI(text);
      }

      this.addBotMessage(response);
      this.speakText(response);
    } catch (error) {
      console.error("Error processing input:", error);
      this.addErrorMessage("Wystąpił błąd podczas przetwarzania. Spróbuj ponownie.");
    } finally {
      this.isProcessing = false;
      this.showLoading(false);
    }
  }

  async processWithHuggingFace(text) {
    const prompt = `Jesteś pomocnym asystentem językowym. Odpowiadaj w języku polskim, naturalnie i przyjaznym tonem. Użytkownik powiedział: "${text}"`;

    const response = await this.hf.textGeneration({
      model: "microsoft/DialoGPT-medium",
      inputs: prompt,
      parameters: {
        max_new_tokens: 100,
        temperature: 0.7,
        return_full_text: false
      }
    });

    return response.generated_text || "Przepraszam, nie mogę teraz odpowiedzieć. Spróbuj ponownie.";
  }

  async processWithOpenAI(text) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Jesteś pomocnym asystentem językowym. Odpowiadaj w języku polskim, naturalnie i przyjaznym tonem."
          },
          {
            role: "user",
            content: text
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Błąd API OpenAI");
    }

    return data.choices[0].message.content;
  }

  async translateWord(word) {
    try {
      const model = this.translationModels[this.currentLanguage];
      if (!model) return "Nie można przetłumaczyć";

      if (this.apiProvider === "huggingface" && this.hf) {
        const result = await this.hf.translation({
          model: model,
          inputs: word
        });
        return result.translation_text || word;
      } else {
        // Fallback for OpenAI or if translation fails
        return `[tłumaczenie: ${word}]`;
      }
    } catch (error) {
      console.error("Translation error:", error);
      return word;
    }
  }

  showLoading(show) {
    this.loadingEl.style.display = show ? "flex" : "none";
  }

  addUserMessage(text) {
    const div = document.createElement("div");
    div.className = "message user-message";
    div.textContent = text;
    this.messagesEl.appendChild(div);
    this.scrollMessages();
  }

  addBotMessage(text) {
    this.removeTranslationPopup();

    const div = document.createElement("div");
    div.className = "message bot-message";

    const words = text.split(/(\s+)/);
    words.forEach(word => {
      if (word.trim().length === 0) {
        div.appendChild(document.createTextNode(word));
        return;
      }
      const span = document.createElement("span");
      span.className = "clickable-word";
      span.textContent = word;
      span.addEventListener("click", e => this.onWordClick(e, word.trim()));
      div.appendChild(span);
    });

    this.messagesEl.appendChild(div);
    this.scrollMessages();
  }

  addErrorMessage(text) {
    const div = document.createElement("div");
    div.className = "message error-message";
    div.textContent = text;
    this.messagesEl.appendChild(div);
    this.scrollMessages();
  }

  scrollMessages() {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  removeTranslationPopup() {
    const popup = document.querySelector(".translation-popup");
    if (popup) popup.remove();
  }

  async onWordClick(event, word) {
    event.stopPropagation();
    this.removeTranslationPopup();

    const cleanWord = word.replace(/[.,!?;:"'()]/g, "");
    if (cleanWord.length === 0) return;

    const popup = document.createElement("div");
    popup.className = "translation-popup";
    popup.style.top = `${event.clientY + 10}px`;
    popup.style.left = `${event.clientX + 10}px`;
    popup.textContent = "Tłumaczę...";

    document.body.appendChild(popup);

    const translation = await this.translateWord(cleanWord);

    popup.innerHTML = `<strong>${cleanWord}</strong> — ${translation}`;

    const starBtn = document.createElement("button");
    starBtn.className = "star-btn";
    starBtn.textContent = "★ Dodaj do ulubionych";
    starBtn.addEventListener("click", () => {
      this.addToFavorites(cleanWord, translation);
      popup.remove();
    });
    popup.appendChild(document.createElement("br"));
    popup.appendChild(starBtn);

    const closePopup = (e) => {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener("click", closePopup);
      }
    };
    setTimeout(() => {
      document.addEventListener("click", closePopup);
    }, 100);
  }

  getFavorites() {
    const fav = sessionStorage.getItem("favorites");
    return fav ? JSON.parse(fav) : [];
  }

  saveFavorites(favs) {
    sessionStorage.setItem("favorites", JSON.stringify(favs));
  }

  addToFavorites(word, translation) {
    let favs = this.getFavorites();
    if (favs.find(f => f.word.toLowerCase() === word.toLowerCase())) {
      this.showNotification("To słówko jest już w ulubionych.", "warning");
      return;
    }
    favs.push({ word, translation, date: new Date().toISOString() });
    this.saveFavorites(favs);
    this.renderFavorites();
    this.showNotification(`Dodano "${word}" do ulubionych!`, "success");
  }

  removeFromFavorites(word) {
    let favs = this.getFavorites();
    favs = favs.filter(f => f.word.toLowerCase() !== word.toLowerCase());
    this.saveFavorites(favs);
    this.renderFavorites();
    this.updateFlashcardStats();
  }

  renderFavorites() {
    const favs = this.getFavorites();
    const searchTerm = this.favoritesSearchEl.value.toLowerCase();
    const filteredFavs = favs.filter(fav =>
        fav.word.toLowerCase().includes(searchTerm) ||
        fav.translation.toLowerCase().includes(searchTerm)
    );

    this.favoritesList.innerHTML = "";

    if (filteredFavs.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state";
      emptyState.innerHTML = `
        <div class="empty-icon">⭐</div>
        <h3>${favs.length === 0 ? "Brak ulubionych słówek" : "Brak wyników wyszukiwania"}</h3>
        <p>${favs.length === 0 ? "Kliknij na słowo w rozmowie, aby je dodać." : "Spróbuj innego wyszukiwania."}</p>
      `;
      this.favoritesList.appendChild(emptyState);
      return;
    }

    filteredFavs.forEach(({ word, translation }) => {
      const div = document.createElement("div");
      div.className = "favorite-word";

      const contentDiv = document.createElement("div");
      contentDiv.className = "favorite-word-content";
      contentDiv.textContent = `${word} — ${translation}`;

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-favorite-btn";
      removeBtn.textContent = "Usuń";
      removeBtn.addEventListener("click", () => this.removeFromFavorites(word));

      div.appendChild(contentDiv);
      div.appendChild(removeBtn);
      this.favoritesList.appendChild(div);
    });
  }

  filterFavorites() {
    this.renderFavorites();
  }

  exportFavorites() {
    const favs = this.getFavorites();
    if (favs.length === 0) {
      this.showNotification("Brak słówek do eksportu.", "warning");
      return;
    }

    const csvContent = "data:text/csv;charset=utf-8," +
        "Słowo,Tłumaczenie,Data\n" +
        favs.map(f => `"${f.word}","${f.translation}","${new Date(f.date).toLocaleDateString()}"`).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ulubione_slowka_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  clearAllFavorites() {
    if (confirm("Czy na pewno chcesz usunąć wszystkie ulubione słówka?")) {
      sessionStorage.removeItem("favorites");
      this.renderFavorites();
      this.updateFlashcardStats();
      this.showNotification("Wszystkie ulubione słówka zostały usunięte.", "success");
    }
  }

  // Flashcards functionality
  initFlashcards() {
    const favs = this.getFavorites();
    if (favs.length === 0) {
      this.flashcardEmptyEl.style.display = "block";
      this.flashcardEl.style.display = "none";
      this.cardActionsEl.style.display = "none";
    } else {
      this.flashcardEmptyEl.style.display = "none";
      this.flashcardEl.style.display = "block";
      this.currentFlashcardIndex = 0;
      this.showCurrentFlashcard();
    }
    this.updateFlashcardStats();
  }

  showCurrentFlashcard() {
    const favs = this.getFavorites();
    if (favs.length === 0) return;

    const current = favs[this.currentFlashcardIndex];
    this.cardWordEl.textContent = current.word;
    this.cardTranslationEl.textContent = current.translation;

    this.flashcardFlipped = false;
    this.flashcardEl.classList.remove("flipped");
    this.cardActionsEl.style.display = "none";
  }

  flipFlashcard() {
    if (this.getFavorites().length === 0) return;

    this.flashcardFlipped = !this.flashcardFlipped;
    this.flashcardEl.classList.toggle("flipped");

    if (this.flashcardFlipped) {
      this.cardActionsEl.style.display = "flex";
    }
  }

  answerFlashcard(result) {
    if (result === "correct") {
      this.correctAnswers++;
    }

    this.nextFlashcard();
    this.updateFlashcardStats();
  }

  nextFlashcard() {
    const favs = this.getFavorites();
    if (favs.length === 0) return;

    this.currentFlashcardIndex = (this.currentFlashcardIndex + 1) % favs.length;
    this.showCurrentFlashcard();
  }

  shuffleFlashcards() {
    const favs = this.getFavorites();
    if (favs.length <= 1) return;

    // Fisher-Yates shuffle algorithm
    for (let i = favs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [favs[i], favs[j]] = [favs[j], favs[i]];
    }

    this.saveFavorites(favs);
    this.currentFlashcardIndex = 0;
    this.showCurrentFlashcard();
    this.showNotification("Fiszki zostały przetasowane!", "success");
  }

  resetFlashcardProgress() {
    if (confirm("Czy na pewno chcesz zresetować postęp nauki?")) {
      this.correctAnswers = 0;
      this.currentFlashcardIndex = 0;
      this.showCurrentFlashcard();
      this.updateFlashcardStats();
      this.showNotification("Postęp został zresetowany.", "success");
    }
  }

  updateFlashcardStats() {
    const favs = this.getFavorites();
    this.currentCardEl.textContent = favs.length > 0 ? this.currentFlashcardIndex + 1 : 0;
    this.totalCardsEl.textContent = favs.length;
    this.correctAnswersEl.textContent = this.correctAnswers;
  }

  showNotification(message, type = "info") {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll(".notification");
    existingNotifications.forEach(n => n.remove());

    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Show notification
    setTimeout(() => {
      notification.classList.add("show");
    }, 100);

    // Hide notification after 3 seconds
    setTimeout(() => {
      notification.classList.remove("show");
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
      }, 300);
    }, 3000);
  }
}

// Initialize the chatbot when the page loads
document.addEventListener("DOMContentLoaded", () => {
  new LanguageChatbot();
});