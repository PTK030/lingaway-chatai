// Inicjalizacja Stimulus
const { Application, Controller } = Stimulus;
const application = Application.start();

// Zmienne globalne - używamy pamięci zamiast localStorage
let apiKey = null;
let apiProvider = 'groq'; // 'groq' lub 'huggingface'
let favorites = [];
let currentCardIndex = 0;
let conversationHistory = [];

// Główny kontroler aplikacji
class ApplicationController extends Controller {
  connect() {
    this.checkApiSetup();
    this.setupKeyboardShortcuts();
  }

  switchTab(event) {
    const tabId = event.currentTarget.dataset.tab;

    // Aktualizuj aktywną zakładkę
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    event.currentTarget.classList.add('active');

    // Pokaż odpowiedni panel
    document.querySelectorAll('.panel').forEach(panel => {
      panel.classList.remove('active');
    });
    document.getElementById(`panel-${tabId}`).classList.add('active');

    // Odśwież dane w aktywnym panelu
    if (tabId === 'favorites') {
      this.refreshFavorites();
    } else if (tabId === 'flashcards') {
      this.refreshFlashcards();
    }
  }

  checkApiSetup() {
    // W środowisku bez localStorage, zawsze pokazuj setup
    document.getElementById('api-setup').classList.add('show');
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        const chatInput = document.querySelector('[data-chat-target="input"]');
        if (chatInput && document.activeElement === chatInput) {
          const chatController = application.getControllerForElementAndIdentifier(
              document.querySelector('[data-controller="chat"]'),
              'chat'
          );
          if (chatController) chatController.sendMessage();
        }
      }
    });
  }

  refreshFavorites() {
    const favController = application.getControllerForElementAndIdentifier(
        document.querySelector('[data-controller="favorites"]'),
        'favorites'
    );
    if (favController) favController.displayFavorites();
  }

  refreshFlashcards() {
    const flashController = application.getControllerForElementAndIdentifier(
        document.querySelector('[data-controller="flashcards"]'),
        'flashcards'
    );
    if (flashController) flashController.loadCards();
  }
}

// Kontroler konfiguracji API
class ApiSetupController extends Controller {
  static targets = ["input", "provider"]

  connect() {
    this.setupProviderListener();
    this.updatePlaceholder();
  }

  setupProviderListener() {
    if (this.hasProviderTarget) {
      this.providerTarget.addEventListener('change', (e) => {
        apiProvider = e.target.value;
        this.updatePlaceholder();
      });
    }
  }

  updatePlaceholder() {
    const placeholder = apiProvider === 'groq' ? 'gsk_...' : 'hf_...';
    if (this.hasInputTarget) {
      this.inputTarget.placeholder = placeholder;
    }
  }

  save() {
    const key = this.inputTarget.value.trim();
    if (!key) {
      alert('Wprowadź klucz API');
      return;
    }

    // Pobierz aktualny provider z selecta
    if (this.hasProviderTarget) {
      apiProvider = this.providerTarget.value;
    }

    // Podstawowa walidacja klucza
    if (apiProvider === 'groq' && !key.startsWith('gsk_')) {
      alert('Klucz Groq powinien zaczynać się od "gsk_"');
      return;
    }
    if (apiProvider === 'huggingface' && !key.startsWith('hf_')) {
      alert('Klucz Hugging Face powinien zaczynać się od "hf_"');
      return;
    }

    apiKey = key;
    document.getElementById('api-setup').classList.remove('show');

    // Dodaj powitanie
    const chatController = application.getControllerForElementAndIdentifier(
        document.querySelector('[data-controller="chat"]'),
        'chat'
    );
    if (chatController) {
      chatController.addMessage(`Witaj! Jestem twoim asystentem do nauki języków. Używam ${apiProvider === 'groq' ? 'Groq' : 'Hugging Face'} API. Jak mogę ci pomóc?`, 'bot');
    }
  }
}

// Kontroler czatu
class ChatController extends Controller {
  static targets = ["messages", "input"]

  connect() {
    this.setupInputHandlers();
  }

  setupInputHandlers() {
    this.inputTarget.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize textarea
    this.inputTarget.addEventListener('input', () => {
      this.inputTarget.style.height = 'auto';
      this.inputTarget.style.height = this.inputTarget.scrollHeight + 'px';
    });
  }

  async sendMessage() {
    const message = this.inputTarget.value.trim();
    if (!message || !apiKey) return;

    this.inputTarget.value = '';
    this.inputTarget.style.height = 'auto';
    this.addMessage(message, 'user');

    // Dodaj do historii
    conversationHistory.push({ role: 'user', content: message });

    try {
      const response = await this.getAIResponse(message);
      this.addMessage(response, 'bot');
      conversationHistory.push({ role: 'assistant', content: response });
    } catch (error) {
      console.error('API Error:', error);
      this.addMessage('Błąd połączenia z API. Sprawdź klucz lub spróbuj ponownie.', 'bot');
    }
  }

  addMessage(content, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;

    if (type === 'bot') {
      messageDiv.innerHTML = this.makeWordsClickable(content);
    } else {
      messageDiv.textContent = content;
    }

    this.messagesTarget.appendChild(messageDiv);
    this.messagesTarget.scrollTop = this.messagesTarget.scrollHeight;
  }

  makeWordsClickable(text) {
    // Ulepszone dopasowanie słów (obsługa polskich znaków)
    return text.replace(/\b[a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+\b/g, (word) => {
      return `<span class="clickable-word" onclick="showTranslation('${word.replace(/'/g, "\\'")}', event)">${word}</span>`;
    });
  }

  async getAIResponse(message) {
    if (apiProvider === 'groq') {
      return await this.getGroqResponse(message);
    } else {
      return await this.getHuggingFaceResponse(message);
    }
  }

  async getGroqResponse(message) {
    const messages = [
      {
        role: 'system',
        content: 'Jesteś pomocnym asystentem do nauki języków. Odpowiadaj w języku polskim, krótko i pomocnie. Pomagaj w nauce gramatyki, słownictwa i konwersacji.'
      },
      ...conversationHistory.slice(-10), // Zachowaj ostatnie 10 wiadomości
      {
        role: 'user',
        content: message
      }
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192', // Szybki model Groq
        messages: messages,
        max_tokens: 500,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async getHuggingFaceResponse(message) {
    // Formatuj historię dla Hugging Face
    let prompt = "Jesteś pomocnym asystentem do nauki języków. Odpowiadaj w języku polskim, krótko i pomocnie.\n\n";

    conversationHistory.slice(-6).forEach(msg => {
      prompt += `${msg.role === 'user' ? 'Użytkownik' : 'Asystent'}: ${msg.content}\n`;
    });

    prompt += `Użytkownik: ${message}\nAsystent:`;

    const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 150,
          temperature: 0.7,
          return_full_text: false
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hugging Face API Error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    if (Array.isArray(data) && data[0] && data[0].generated_text) {
      return data[0].generated_text.replace(prompt, '').trim();
    }

    return 'Przepraszam, nie mogę teraz odpowiedzieć. Spróbuj ponownie.';
  }

  clearChat() {
    if (confirm('Wyczyścić czat?')) {
      this.messagesTarget.innerHTML = '';
      conversationHistory = [];
    }
  }
}

// Kontroler ulubionych
class FavoritesController extends Controller {
  static targets = ["list"]

  connect() {
    this.displayFavorites();
  }

  displayFavorites() {
    if (favorites.length === 0) {
      this.listTarget.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">⭐</div>
          <h3>Brak ulubionych słówek</h3>
          <p>Kliknij na słowo w rozmowie, aby dodać do ulubionych.</p>
        </div>
      `;
      return;
    }

    this.listTarget.innerHTML = favorites.map(fav => `
      <div class="favorite-item">
        <div class="favorite-content">
          <div class="favorite-word">${fav.word}</div>
          <div class="favorite-translation">${fav.translation}</div>
          <div class="favorite-context">${fav.context || ''}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="removeFavorite(${fav.id})">
          🗑️ Usuń
        </button>
      </div>
    `).join('');
  }

  clearAll() {
    if (confirm('Usunąć wszystkie ulubione słówka?')) {
      favorites = [];
      this.displayFavorites();

      // Odśwież fiszki
      const flashController = application.getControllerForElementAndIdentifier(
          document.querySelector('[data-controller="flashcards"]'),
          'flashcards'
      );
      if (flashController) flashController.loadCards();
    }
  }
}

// Kontroler fiszek
class FlashcardsController extends Controller {
  static targets = ["empty", "card", "word", "translation", "current", "total"]

  connect() {
    this.loadCards();
  }

  loadCards() {
    this.updateStats();

    if (favorites.length === 0) {
      this.emptyTarget.style.display = 'block';
      this.cardTarget.style.display = 'none';
      return;
    }

    this.emptyTarget.style.display = 'none';
    this.cardTarget.style.display = 'block';
    this.showCurrentCard();
  }

  updateStats() {
    this.currentTarget.textContent = favorites.length > 0 ? currentCardIndex + 1 : 0;
    this.totalTarget.textContent = favorites.length;
  }

  showCurrentCard() {
    if (favorites.length === 0) {
      this.loadCards();
      return;
    }

    if (currentCardIndex >= favorites.length) {
      currentCardIndex = 0;
    }

    const card = favorites[currentCardIndex];
    this.wordTarget.textContent = card.word;
    this.translationTarget.textContent = card.translation;
    this.translationTarget.style.display = 'none';

    // Resetuj widok karty
    this.cardTarget.querySelector('.card-actions').style.display = 'none';
    this.cardTarget.querySelector('.btn-primary').style.display = 'inline-flex';

    this.updateStats();
  }

  showTranslation() {
    this.translationTarget.style.display = 'block';
    this.cardTarget.querySelector('.btn-primary').style.display = 'none';
    this.cardTarget.querySelector('.card-actions').style.display = 'block';
  }

  nextCard() {
    currentCardIndex++;
    this.showCurrentCard();
  }

  previousCard() {
    currentCardIndex = currentCardIndex > 0 ? currentCardIndex - 1 : favorites.length - 1;
    this.showCurrentCard();
  }
}

// Funkcje globalne
window.showTranslation = function(word, event) {
  event.preventDefault();
  event.stopPropagation();

  // Usuń istniejące popup
  const existing = document.querySelector('.translation-popup');
  if (existing) existing.remove();

  // Stwórz nowy popup
  const popup = document.createElement('div');
  popup.className = 'translation-popup';
  popup.innerHTML = `
    <div><strong>${word}</strong></div>
    <div class="popup-actions">
      <button class="star-btn" onclick="addToFavorites('${word.replace(/'/g, "\\'")}')">
        ⭐ Dodaj do ulubionych
      </button>
      <button class="translate-btn" onclick="translateWord('${word.replace(/'/g, "\\'")}')">
        🔄 Przetłumacz
      </button>
    </div>
  `;

  // Pozycjonuj popup
  const rect = event.target.getBoundingClientRect();
  popup.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
  popup.style.top = (rect.bottom + 5) + 'px';

  document.body.appendChild(popup);

  // Usuń popup po kliknięciu gdzie indziej
  setTimeout(() => {
    document.addEventListener('click', function remove(e) {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', remove);
      }
    });
  }, 100);
};

window.translateWord = async function(word) {
  if (!apiKey) return;

  const popup = document.querySelector('.translation-popup');
  if (popup) {
    popup.innerHTML = `<div>Tłumaczę "${word}"...</div>`;
  }

  try {
    let translation;
    if (apiProvider === 'groq') {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: [
            {
              role: 'system',
              content: 'Jesteś tłumaczem. Podaj tylko tłumaczenie słowa na język polski, bez dodatkowych wyjaśnień.'
            },
            {
              role: 'user',
              content: `Przetłumacz słowo: ${word}`
            }
          ],
          max_tokens: 50,
          temperature: 0.3
        })
      });

      if (response.ok) {
        const data = await response.json();
        translation = data.choices[0].message.content.trim();
      }
    } else {
      // Dla Hugging Face - prostsze tłumaczenie
      const response = await fetch('https://api-inference.huggingface.co/models/Helsinki-NLP/opus-mt-en-pl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          inputs: word
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data[0] && data[0].translation_text) {
          translation = data[0].translation_text;
        }
      }
    }

    if (popup) {
      popup.innerHTML = `
        <div><strong>${word}</strong></div>
        <div class="translation-result">${translation || 'Nie udało się przetłumaczyć'}</div>
        <button class="star-btn" onclick="addToFavorites('${word.replace(/'/g, "\\'")}', '${translation ? translation.replace(/'/g, "\\'") : ''}')">
          ⭐ Dodaj do ulubionych
        </button>
      `;
    }
  } catch (error) {
    console.error('Translation error:', error);
    if (popup) {
      popup.innerHTML = `
        <div><strong>${word}</strong></div>
        <div>Błąd tłumaczenia</div>
        <button class="star-btn" onclick="addToFavorites('${word.replace(/'/g, "\\'")}')">
          ⭐ Dodaj do ulubionych
        </button>
      `;
    }
  }
};

window.addToFavorites = function(word, translation = null) {
  // Sprawdź czy już istnieje
  if (favorites.some(fav => fav.word.toLowerCase() === word.toLowerCase())) {
    alert('Słowo już jest w ulubionych');
    return;
  }

  if (!translation) {
    translation = prompt(`Podaj tłumaczenie dla słowa "${word}":`);
    if (!translation) return;
  }

  const favorite = {
    id: Date.now(),
    word: word,
    translation: translation,
    context: '',
    addedAt: new Date().toISOString()
  };

  favorites.push(favorite);

  // Usuń popup
  const popup = document.querySelector('.translation-popup');
  if (popup) popup.remove();

  // Pokaż powiadomienie
  showNotification(`Dodano "${word}" do ulubionych!`, 'success');

  // Odśwież widoki
  const appController = application.getControllerForElementAndIdentifier(
      document.querySelector('[data-controller="application"]'),
      'application'
  );
  if (appController) {
    appController.refreshFavorites();
    appController.refreshFlashcards();
  }
};

window.removeFavorite = function(id) {
  if (confirm('Usunąć to słówko z ulubionych?')) {
    favorites = favorites.filter(fav => fav.id !== id);

    // Dostosuj indeks karty jeśli trzeba
    if (currentCardIndex >= favorites.length && favorites.length > 0) {
      currentCardIndex = 0;
    }

    // Odśwież widoki
    const appController = application.getControllerForElementAndIdentifier(
        document.querySelector('[data-controller="application"]'),
        'application'
    );
    if (appController) {
      appController.refreshFavorites();
      appController.refreshFlashcards();
    }
  }
};

// Funkcja powiadomień
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  // Dodaj style CSS jako string
  const style = document.createElement('style');
  style.textContent = `
    .notification {
      position: fixed;
      top: 20px;
      right: 20px;
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      z-index: 1001;
      font-family: Inter, sans-serif;
      font-weight: 500;
      animation: slideInRight 0.3s ease-out;
    }
    .notification.success {
      background: #10b981;
    }
    .notification.info {
      background: #3b82f6;
    }
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;

  if (!document.querySelector('#notification-styles')) {
    style.id = 'notification-styles';
    document.head.appendChild(style);
  }

  notification.style.background = type === 'success' ? '#10b981' : '#3b82f6';
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Rejestracja kontrolerów
application.register('application', ApplicationController);
application.register('api-setup', ApiSetupController);
application.register('chat', ChatController);
application.register('favorites', FavoritesController);
application.register('flashcards', FlashcardsController);

// Dodaj style dla popup i innych elementów
const globalStyles = document.createElement('style');
globalStyles.textContent = `
  .translation-popup {
    position: fixed;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    padding: 1rem;
    z-index: 1000;
    max-width: 300px;
    font-family: Inter, sans-serif;
  }
  
  .popup-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
  
  .star-btn, .translate-btn {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background-color 0.2s;
  }
  
  .star-btn:hover, .translate-btn:hover {
    background: #2563eb;
  }
  
  .translation-result {
    margin: 0.5rem 0;
    font-style: italic;
    color: #6b7280;
  }
  
  .clickable-word {
    cursor: pointer;
    color: #3b82f6;
    text-decoration: underline;
    text-decoration-style: dotted;
  }
  
  .clickable-word:hover {
    background: #eff6ff;
  }
`;
document.head.appendChild(globalStyles);