class CategoryEditor {
  constructor() {
    this.categories = [];
    this.configCategories = [];
    this.currentIndex = null;
    this.slugDirty = false;
    this.apiBase = this.resolveApiBase();
    this.init();
  }

  normalizeCategoryKey(value) {
    return (value || '').trim().toLowerCase();
  }

  resolveApiBase() {
    if (window.location.protocol === 'file:') {
      return 'http://localhost:3010';
    }
    return '';
  }

  buildApiUrl(endpoint) {
    if (/^https?:\/\//i.test(endpoint)) {
      return endpoint;
    }
    return `${this.apiBase}${endpoint}`;
  }

  async requestJson(endpoint, options = {}, fallbackErrorMessage = 'Request failed') {
    const url = this.buildApiUrl(endpoint);
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      throw new Error(`Could not reach API (${url}). Start server.js and try again.`);
    }

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const message = isJson
        ? (payload?.error || payload?.message || fallbackErrorMessage)
        : `${fallbackErrorMessage} (${response.status})`;
      throw new Error(message);
    }

    return payload;
  }

  async init() {
    this.cacheElements();
    this.bindEvents();
    await this.loadConfig();
  }

  cacheElements() {
    this.categoryList = document.getElementById('category-list');
    this.newBtn = document.getElementById('new-category-btn');
    this.refreshBtn = document.getElementById('refresh-config-btn');
    this.saveBtn = document.getElementById('save-category-btn');
    this.deleteBtn = document.getElementById('delete-category-btn');
    this.resetBtn = document.getElementById('reset-category-btn');
    this.generateBtn = document.getElementById('generate-category-btn');

    this.nameInput = document.getElementById('category-name');
    this.slugInput = document.getElementById('category-slug');
    this.descriptionInput = document.getElementById('category-description');
    this.colorInput = document.getElementById('category-color');
    this.colorChip = document.getElementById('color-chip');
    this.colorLabel = document.getElementById('color-label');
    this.countInput = document.getElementById('category-count');
    this.sourceInput = document.getElementById('category-source');
    this.topicsInput = document.getElementById('category-topics');
    this.refreshTopicsBtn = document.getElementById('refresh-topics-btn');
    this.suggestTopicsBtn = document.getElementById('suggest-topics-btn');
    this.topicChipsContainer = document.getElementById('topic-suggestion-chips');
    this.topicChipsHint = document.getElementById('topic-chips-hint');

    this.modal = document.getElementById('generator-modal');
    this.closeModalBtn = document.getElementById('close-generator');
    this.cancelModalBtn = document.getElementById('cancel-generator');
    this.runBtn = document.getElementById('run-generator');
    this.mergeCheckbox = document.getElementById('generator-merge');
    this.mergeOnlyCheckbox = document.getElementById('generator-merge-only');
    this.generatorCount = document.getElementById('generator-count');
    this.generatorTopics = document.getElementById('generator-topics');
    this.generatorLog = document.getElementById('generator-log');
    this.loadRunLogBtn = document.getElementById('load-run-log');
    this.loadMergeLogBtn = document.getElementById('load-merge-log');
    this.clearLogBtn = document.getElementById('clear-log');
    this.runSummary = document.getElementById('run-summary');
    this.summaryCreated = document.getElementById('summary-created');
    this.summaryMerged = document.getElementById('summary-merged');
    this.summarySkipped = document.getElementById('summary-skipped');
    this.summaryFailed = document.getElementById('summary-failed');
    this.summaryPlaceholders = document.getElementById('summary-placeholders');
    this.openDraftsBtn = document.getElementById('open-drafts-btn');

    this.disambigPanel = document.getElementById('disambig-panel');
    this.disambigCards = document.getElementById('disambig-cards');
    this.disambigConfirmBtn = document.getElementById('disambig-confirm-btn');
    this.disambigSkipBtn = document.getElementById('disambig-skip-btn');
  }

  bindEvents() {
    this.newBtn.addEventListener('click', () => this.startNewCategory());
    this.refreshBtn.addEventListener('click', () => this.loadConfig());
    this.saveBtn.addEventListener('click', () => this.saveCategory());
    this.deleteBtn.addEventListener('click', () => this.deleteCategory());
    this.resetBtn.addEventListener('click', () => this.resetForm());
    this.generateBtn.addEventListener('click', () => this.openGenerator());

    this.nameInput.addEventListener('input', () => this.handleNameInput());
    this.slugInput.addEventListener('input', () => {
      this.slugDirty = true;
    });
    this.colorInput.addEventListener('input', () => this.updateColorPreview());

    this.closeModalBtn.addEventListener('click', () => this.closeGenerator());
    this.cancelModalBtn.addEventListener('click', () => this.closeGenerator());
    this.runBtn.addEventListener('click', () => this.startGeneration());
    if (this.disambigConfirmBtn) {
      this.disambigConfirmBtn.addEventListener('click', () => this.confirmDisambig());
    }
    if (this.disambigSkipBtn) {
      this.disambigSkipBtn.addEventListener('click', () => this.runGeneration({}, []));
    }
    this.loadRunLogBtn.addEventListener('click', () => this.loadLog('/api/grab-log'));
    this.loadMergeLogBtn.addEventListener('click', () => this.loadLog('/api/merge-enrichment-log'));
    this.clearLogBtn.addEventListener('click', () => {
      this.generatorLog.textContent = '';
    });
    if (this.refreshTopicsBtn) {
      this.refreshTopicsBtn.addEventListener('click', () => {
        const category = this.categories[this.currentIndex];
        const categoryName = category?.value || category?.name || category?.slug || '';
        this.populateTopicsFromPosters(categoryName, true);
      });
    }
    if (this.suggestTopicsBtn) {
      this.suggestTopicsBtn.addEventListener('click', () => this.suggestTopicsFromAI());
    }
  }

  async loadConfig() {
    try {
      const [config, posterCategories] = await Promise.all([
        this.requestJson('/api/category-config', {}, 'Failed to load category config'),
        this.requestJson('/api/categories', {}, 'Failed to load categories')
      ]);

      this.configCategories = Array.isArray(config.categories) ? config.categories : [];
      this.categories = this.mergeCategories(this.configCategories, posterCategories);
      this.renderList();
      if (this.categories.length) {
        this.selectCategory(0);
      } else {
        this.startNewCategory();
      }
    } catch (error) {
      console.error('Error loading category config:', error);
    }
  }

  mergeCategories(configCategories, posterCategories) {
    const merged = [];
    const indexMap = new Map();

    configCategories.forEach((category, index) => {
      const key = this.normalizeCategoryKey(category.name || category.slug);
      if (!key) return;
      const entry = {
        ...category,
        managed: true,
        configIndex: index,
        key,
        value: category.name || category.slug || ''
      };
      merged.push(entry);
      indexMap.set(key, entry);
    });

    if (Array.isArray(posterCategories)) {
      posterCategories.forEach(category => {
        const rawValue = category?.value || category?.name || '';
        const name = rawValue;
        const key = this.normalizeCategoryKey(rawValue);
        if (!key || indexMap.has(key)) return;
        merged.push({
          name,
          value: rawValue,
          key,
          slug: this.slugify(rawValue || name),
          description: '',
          color: '#f48c06',
          targetCount: null,
          source: 'wikipedia',
          topics: [],
          managed: false,
          configIndex: null
        });
      });
    }

    return merged.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  renderList() {
    this.categoryList.innerHTML = '';
    this.categories.forEach((category, index) => {
      const item = document.createElement('div');
      item.className = 'category-item';
      if (index === this.currentIndex) {
        item.classList.add('active');
      }

      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = category.name || 'Untitled';

      const pill = document.createElement('span');
      pill.className = 'pill';
      if (category.managed) {
        pill.textContent = (category.slug || 'new').toUpperCase();
      } else {
        pill.textContent = 'POSTER';
      }

      item.appendChild(label);
      item.appendChild(pill);
      item.addEventListener('click', () => this.selectCategory(index));
      this.categoryList.appendChild(item);
    });
  }

  selectCategory(index) {
    this.currentIndex = index;
    this.slugDirty = false;
    const category = this.categories[index];
    if (!category) return;

    const hasTopics = Array.isArray(category.topics) && category.topics.length > 0;
    this.nameInput.value = category.name || '';
    this.slugInput.value = category.slug || '';
    this.descriptionInput.value = category.description || '';
    this.colorInput.value = category.color || '#f48c06';
    this.countInput.value = category.targetCount || '';
    this.sourceInput.value = category.source || 'wikipedia';
    this.topicsInput.value = (category.topics || []).join('\n');
    this._clearTopicChips();
    this.deleteBtn.disabled = false;
    this.updateColorPreview();
    this.renderList();

    if (!hasTopics && !category.managed) {
      const categoryName = category.value || category.name || category.slug || '';
      this.populateTopicsFromPosters(categoryName, false);
    }
  }

  startNewCategory() {
    this.currentIndex = null;
    this.slugDirty = false;
    this.nameInput.value = '';
    this.slugInput.value = '';
    this.descriptionInput.value = '';
    this.colorInput.value = '#f48c06';
    this.countInput.value = '';
    this.sourceInput.value = 'wikipedia';
    this.topicsInput.value = '';
    this._clearTopicChips();
    this.deleteBtn.disabled = true;
    this.updateColorPreview();
    this.renderList();
  }

  resetForm() {
    if (this.currentIndex === null) {
      this.startNewCategory();
    } else {
      this.selectCategory(this.currentIndex);
    }
  }

  handleNameInput() {
    if (!this.slugDirty) {
      this.slugInput.value = this.slugify(this.nameInput.value);
    }
  }

  updateColorPreview() {
    const value = this.colorInput.value || '#f48c06';
    this.colorChip.style.background = value;
    this.colorLabel.textContent = value;
  }

  slugify(value) {
    return (value || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
  }

  buildCategoryPayload() {
    const name = this.nameInput.value.trim();
    const slug = (this.slugInput.value || this.slugify(name)).trim();
    const topics = this.parseTopics(this.topicsInput.value);
    const targetCount = this.countInput.value ? parseInt(this.countInput.value, 10) : null;

    return {
      name,
      slug,
      description: this.descriptionInput.value.trim(),
      color: this.colorInput.value || '#f48c06',
      targetCount,
      source: this.sourceInput.value || 'wikipedia',
      topics
    };
  }

  parseTopics(raw) {
    const seen = new Set();
    return raw
      .split(/\n|,/)
      .map(value => value.trim())
      .filter(Boolean)
      .filter(topic => {
        const key = topic.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  findConfigIndexForCategory(category) {
    if (!category) return -1;
    if (Number.isInteger(category.configIndex) && this.configCategories[category.configIndex]) {
      const candidate = this.configCategories[category.configIndex];
      const categoryKey = this.normalizeCategoryKey(category.name || category.slug);
      const candidateKey = this.normalizeCategoryKey(candidate.name || candidate.slug);
      if (candidateKey === categoryKey) {
        return category.configIndex;
      }
    }

    const lookupKey = this.normalizeCategoryKey(category.name || category.slug || category.value);
    return this.configCategories.findIndex(item =>
      this.normalizeCategoryKey(item.name || item.slug) === lookupKey
    );
  }

  async populateTopicsFromPosters(categoryName, forceRefresh = false) {
    if (!categoryName) return;
    const existingTopics = forceRefresh ? this.parseTopics(this.topicsInput.value) : [];
    if (!forceRefresh && this.topicsInput.value.trim()) return;
    try {
      const posters = await this.requestJson(
        `/api/posters-in-category?category=${encodeURIComponent(categoryName)}`,
        {},
        'Failed to load posters for category'
      );
      const topics = new Set();

      existingTopics.forEach(topic => topics.add(topic));

      posters.forEach(poster => {
        const meta = poster.meta || poster.data?.meta || poster.data || {};
        const source = meta.source || '';
        if (typeof source === 'string' && source.includes('wikipedia.org/wiki/')) {
          try {
            const url = new URL(source);
            const match = url.pathname.match(/\/wiki\/(.+)$/);
            if (match && match[1]) {
              topics.add(decodeURIComponent(match[1]));
            }
          } catch (error) {
            // Ignore invalid URLs
          }
        }

        const tags = meta.tags || [];
        if (Array.isArray(tags)) {
          tags.forEach(tag => {
            if (typeof tag === 'string' && tag.trim()) {
              topics.add(tag.trim().replace(/\s+/g, '_'));
            }
          });
        }
      });

      const sortedTopics = Array.from(topics).sort((a, b) => a.localeCompare(b));
      if (sortedTopics.length) {
        this.topicsInput.value = sortedTopics.join('\n');
      }
    } catch (error) {
      console.error('Error loading topics from posters:', error);
    }
  }

  async suggestTopicsFromAI() {
    const categoryDescription = this.descriptionInput.value.trim();
    if (!categoryDescription) {
      window.alert('Enter a category description first. Suggestions are based on description context.');
      return;
    }

    const categoryName = this.nameInput.value.trim();
    const source = this.sourceInput.value || 'wikipedia';
    const existingTopics = this.parseTopics(this.topicsInput.value);
    const limit = 12;

    try {
      const data = await this.requestJson('/api/ai/topic-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryName,
          categoryDescription,
          source,
          existingTopics,
          limit
        })
      }, 'Failed to fetch AI suggestions');
      const results = Array.isArray(data?.topics) ? data.topics : [];
      const seen = new Set(existingTopics.map(topic => topic.toLowerCase()));
      const staged = [];
      results.forEach(topic => {
        if (typeof topic !== 'string') return;
        const normalized = topic.trim().replace(/\s+/g, '_');
        if (!normalized) return;
        const key = normalized.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        staged.push(normalized);
      });
      this._renderTopicChips(staged);
      if (!staged.length) {
        window.alert('No new suggestions returned. Try refining the description.');
      }
    } catch (error) {
      console.error('Error fetching AI suggestions:', error);
      window.alert(`Could not load AI suggestions: ${error.message}`);
    }
  }

  _clearTopicChips() {
    if (this.topicChipsContainer) this.topicChipsContainer.innerHTML = '';
    if (this.topicChipsHint) this.topicChipsHint.style.display = 'none';
  }

  _renderTopicChips(topics) {
    this._clearTopicChips();
    if (!topics.length) return;
    topics.forEach(topic => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'editor-btn small';
      chip.style.cssText = 'font-size:0.78em; padding:0.2em 0.65em; border-radius:1em; opacity:0.9;';
      chip.textContent = topic.replace(/_/g, ' ');
      chip.title = `Add "${topic}" to topics`;
      chip.addEventListener('click', () => {
        const current = this.parseTopics(this.topicsInput.value);
        const key = topic.toLowerCase();
        if (!current.map(t => t.toLowerCase()).includes(key)) {
          this.topicsInput.value = [...current, topic].join('\n');
        }
        chip.style.opacity = '0.35';
        chip.disabled = true;
      });
      this.topicChipsContainer.appendChild(chip);
    });
    if (this.topicChipsHint) this.topicChipsHint.style.display = '';
  }

  async saveCategory() {
    const payload = this.buildCategoryPayload();
    if (!payload.name) {
      window.alert('Category name is required.');
      return;
    }

    if (this.currentIndex === null) {
      this.configCategories.push(payload);
    } else {
      const current = this.categories[this.currentIndex];
      const configIndex = this.findConfigIndexForCategory(current);
      if (configIndex !== -1) {
        this.configCategories[configIndex] = payload;
      } else {
        this.configCategories.push(payload);
      }
    }

    try {
      await this.requestJson('/api/category-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: this.configCategories })
      }, 'Failed to save category config');
      const savedSlug = payload.slug || payload.name || '';
      await this.loadConfig();
      // Re-select the category we just saved instead of defaulting to index 0
      if (savedSlug) {
        const idx = this.categories.findIndex(
          c => (c.slug || c.name || '') === savedSlug
        );
        if (idx !== -1) this.selectCategory(idx);
      }
    } catch (error) {
      console.error('Error saving category config:', error);
    }
  }

  async deleteCategory() {
    if (this.currentIndex === null) return;
    const category = this.categories[this.currentIndex];
    const categoryName = category.value || category.name || category.slug || '';
    if (!categoryName) {
      window.alert('Select a category to delete.');
      return;
    }
    const confirmDelete = window.confirm(
      `Delete category "${categoryName}" from config and remove it from all posters that use it?`
    );
    if (!confirmDelete) return;

    this.currentIndex = null;
    try {
      const result = await this.requestJson('/api/delete-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoryName })
      }, 'Failed to delete category');
      await this.loadConfig();
      const removedCount = Number(result?.categoryRefsRemoved) || 0;
      window.alert(`Deleted category "${categoryName}". Removed from ${removedCount} poster reference(s).`);
    } catch (error) {
      console.error('Error deleting category:', error);
      window.alert(`Failed to delete category: ${error.message}`);
    }
  }

  openGenerator() {
    const payload = this.buildCategoryPayload();
    this.generatorCount.value = payload.targetCount || '';
    this.generatorTopics.value = payload.topics.join('\n');
    this.mergeCheckbox.checked = true;
    this.mergeOnlyCheckbox.checked = false;
    this.generatorLog.textContent = '';
    if (this.disambigPanel) this.disambigPanel.style.display = 'none';
    if (this.runSummary) this.runSummary.style.display = 'none';
    if (this.openDraftsBtn) this.openDraftsBtn.style.display = 'none';
    this._disambigResolutions = {};
    this._disambigAiTopics = [];
    this.modal.classList.add('active');
  }

  closeGenerator() {
    this.modal.classList.remove('active');
  }

  _getGeneratorTopics(payload) {
    const overrideTopics = this.parseTopics(this.generatorTopics.value);
    return overrideTopics.length ? overrideTopics : payload.topics;
  }

  async startGeneration() {
    const payload = this.buildCategoryPayload();
    if (!payload.name) {
      window.alert('Save the category name before running.');
      return;
    }
    const topicsToUse = this._getGeneratorTopics(payload);
    if (!topicsToUse.length) {
      window.alert('Add at least one topic to run the generator.');
      return;
    }

    const source = (payload.source || 'wikipedia').toLowerCase();
    const isWikipedia = source === 'wikipedia';

    if (isWikipedia) {
      // Run preflight disambiguation check first
      this.generatorLog.textContent = `Checking ${topicsToUse.length} topic(s) on Wikipedia...\n`;
      if (this.disambigPanel) this.disambigPanel.style.display = 'none';
      this.runBtn.disabled = true;
      try {
        const result = await this.requestJson('/api/preflight/topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topics: topicsToUse, source })
        }, 'Preflight check failed');

        const issues = (result.results || []).filter(r => r.status === 'notfound' || r.status === 'disambiguation');
        if (issues.length) {
          this.generatorLog.textContent = `Found ${issues.length} topic(s) needing resolution. Choose an option for each below.\n`;
          this.showDisambigPanel(issues, topicsToUse);
          return; // wait for user to resolve
        }
        // No issues — run directly
        this.generatorLog.textContent = `All topics OK. Starting generation...\n`;
      } catch (err) {
        this.generatorLog.textContent = `Preflight check failed: ${err.message}\nProceeding with generation anyway...\n`;
      } finally {
        this.runBtn.disabled = false;
      }
    }

    await this.runGeneration({}, []);
  }

  showDisambigPanel(issues, allTopics) {
    this._disambigResolutions = {};
    this._disambigAiTopics = [];
    this._disambigIssueTopics = new Set(issues.map(i => i.topic));
    this.disambigCards.innerHTML = '';

    for (const issue of issues) {
      const card = this.buildDisambigCard(issue);
      this.disambigCards.appendChild(card);
    }

    this.disambigPanel.style.display = '';
    this.disambigConfirmBtn.disabled = true; // enabled once all resolved
    this._updateDisambigConfirmState();
  }

  buildDisambigCard(issue) {
    const card = document.createElement('div');
    card.className = 'disambig-card';
    card.dataset.topic = issue.topic;

    const statusLabel = issue.status === 'notfound' ? 'Not Found' : 'Disambiguation';
    const statusClass = issue.status === 'notfound' ? 'notfound' : 'disambiguation';

    const header = document.createElement('div');
    header.className = 'disambig-card-header';
    header.innerHTML = `<span class="disambig-topic-name">${issue.topic.replace(/_/g, ' ')}</span>
      <span class="disambig-status ${statusClass}">${statusLabel}</span>`;
    card.appendChild(header);

    const chips = document.createElement('div');
    chips.className = 'disambig-chips';

    const suggestions = issue.suggestions || [];
    for (const suggestion of suggestions) {
      const chip = document.createElement('button');
      chip.className = 'disambig-chip';
      chip.textContent = suggestion.replace(/_/g, ' ');
      chip.title = suggestion;
      chip.addEventListener('click', () => this._selectDisambigChip(card, issue.topic, suggestion, false, chip));
      chips.appendChild(chip);
    }

    const aiChip = document.createElement('button');
    aiChip.className = 'disambig-chip ai-chip';
    aiChip.textContent = '✦ Use AI';
    aiChip.addEventListener('click', () => this._selectDisambigChip(card, issue.topic, '__AI__', true, aiChip));
    chips.appendChild(aiChip);

    card.appendChild(chips);

    const resolution = document.createElement('div');
    resolution.className = 'disambig-resolution';
    resolution.style.display = 'none';
    card.appendChild(resolution);

    return card;
  }

  _selectDisambigChip(card, originalTopic, choice, isAI, chipEl) {
    // Deselect all chips in this card
    card.querySelectorAll('.disambig-chip').forEach(c => c.classList.remove('selected'));
    // Select the clicked chip
    if (chipEl) chipEl.classList.add('selected');

    // Record resolution
    if (isAI) {
      delete this._disambigResolutions[originalTopic];
      if (!this._disambigAiTopics.includes(originalTopic)) {
        this._disambigAiTopics.push(originalTopic);
      }
      card.querySelector('.disambig-resolution').textContent = '✦ AI will generate content';
    } else {
      this._disambigAiTopics = this._disambigAiTopics.filter(t => t !== originalTopic);
      this._disambigResolutions[originalTopic] = choice;
      card.querySelector('.disambig-resolution').textContent = `→ ${choice.replace(/_/g, ' ')}`;
    }

    card.querySelector('.disambig-resolution').style.display = '';
    card.classList.add('resolved');
    this._updateDisambigConfirmState();
  }

  _updateDisambigConfirmState() {
    const totalIssues = this._disambigIssueTopics ? this._disambigIssueTopics.size : 0;
    const resolved = Object.keys(this._disambigResolutions).length + this._disambigAiTopics.length;
    this.disambigConfirmBtn.disabled = resolved < totalIssues;
  }

  async confirmDisambig() {
    if (this.disambigPanel) this.disambigPanel.style.display = 'none';
    await this.runGeneration(this._disambigResolutions, this._disambigAiTopics);
  }

  async runGeneration(topicOverrides, aiTopics) {
    const payload = this.buildCategoryPayload();
    const topicsToUse = this._getGeneratorTopics(payload);
    const count = this.generatorCount.value ? parseInt(this.generatorCount.value, 10) : null;

    if (this.runSummary) this.runSummary.style.display = 'none';
    if (this.openDraftsBtn) this.openDraftsBtn.style.display = 'none';
    this.runBtn.disabled = true;

    // Elapsed-time counter so users know we haven't stalled
    const source = payload.source || 'wikipedia';
    let elapsed = 0;
    const updateHeader = () => {
      const lines = this.generatorLog.textContent.split('\n');
      lines[0] = `Running ${source} generator… ${elapsed}s`;
      this.generatorLog.textContent = lines.join('\n');
    };
    this.generatorLog.textContent = `Running ${source} generator… 0s\n`;
    this._elapsedTimer = setInterval(() => { elapsed++; updateHeader(); }, 1000);

    try {
      const body = {
        source: payload.source || 'wikipedia',
        category: payload.name,
        topics: topicsToUse,
        count,
        mergeEnrich: this.mergeCheckbox.checked,
        mergeOnly: this.mergeOnlyCheckbox.checked
      };
      if (topicOverrides && Object.keys(topicOverrides).length) {
        body.topicOverrides = topicOverrides;
      }
      if (aiTopics && aiTopics.length) {
        body.aiTopics = aiTopics;
      }
      const data = await this.requestJson('/api/run-grab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }, 'Failed to run generator');
      const output = data.output || 'No output returned.';
      this.generatorLog.textContent = output;
      this.showRunSummary(output);
    } catch (error) {
      this.generatorLog.textContent = `Error: ${error.message}`;
    } finally {
      clearInterval(this._elapsedTimer);
      this._elapsedTimer = null;
      this.runBtn.disabled = false;
    }
  }

  showRunSummary(output) {
    const extract = (pattern) => {
      const m = output.match(pattern);
      return m ? parseInt(m[1], 10) : 0;
    };
    const created = extract(/^Created:\s*(\d+)/m);
    const merged = extract(/^MERGE enriched:\s*(\d+)/m);
    const skipped = extract(/^SKIP duplicates:\s*(\d+)/m);
    const failed = extract(/^Failed:\s*(\d+)/m);
    const placeholders = (output.match(/CLARIFY needed for topic:/g) || []).length;

    if (this.summaryCreated) this.summaryCreated.textContent = created;
    if (this.summaryMerged) this.summaryMerged.textContent = merged;
    if (this.summarySkipped) this.summarySkipped.textContent = skipped;
    if (this.summaryFailed) this.summaryFailed.textContent = failed;
    if (this.summaryPlaceholders) this.summaryPlaceholders.textContent = placeholders;
    if (this.runSummary) this.runSummary.style.display = '';
    if (this.openDraftsBtn && placeholders > 0) this.openDraftsBtn.style.display = '';
  }

  async loadLog(endpoint) {
    try {
      const data = await this.requestJson(endpoint, {}, 'Failed to load log');
      this.generatorLog.textContent = data.log || 'No log available.';
    } catch (error) {
      this.generatorLog.textContent = `Error: ${error.message}`;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new CategoryEditor();
});
