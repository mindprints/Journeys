function f(k) {
	if (Math.abs(k) > .5)
		scrollTo(0, .5 * (k - Math.sign(k) + 1) * (document.documentElement.offsetHeight - window.innerHeight))
}

f(-1);

addEventListener('scroll', e => f(+getComputedStyle(document.body).getPropertyValue('--k')));

// Wait for DOM to be loaded
document.addEventListener('DOMContentLoaded', () => {
	const chooser = document.getElementById('directory-chooser');
	const postersContainer = document.getElementById('posters-container');
	const rotationSpeedInput = document.getElementById('rotation-speed');
	const rotationSpeedValue = document.getElementById('rotation-speed-value');
	const DEFAULT_ROTATION_MS = 10000;
	const DEFAULT_SECONDS_PER_CARD = 10;
	let autoRotateActive = false;
	let autoRotateId = null;
	let lastAutoRotateTime = 0;
	let userInputPaused = false;
	let secondsPerCard = DEFAULT_SECONDS_PER_CARD;
	const clampPercent = (value) => {
		const parsed = Number.parseFloat(value);
		if (!Number.isFinite(parsed)) return null;
		return Math.min(100, Math.max(10, parsed));
	};
	const applyImageSizing = (imgEl, imageConfig) => {
		if (!imgEl || !imageConfig) return;
		imgEl.style.objectFit = imageConfig.fit || 'cover';
		const maxWidth = clampPercent(imageConfig.maxWidth);
		const maxHeight = clampPercent(imageConfig.maxHeight);
		imgEl.style.maxWidth = maxWidth === null ? '' : `${maxWidth}%`;
		imgEl.style.maxHeight = maxHeight === null ? '' : `${maxHeight}%`;
	};

	function getPosterCount() {
		return postersContainer.querySelectorAll('article').length || 1;
	}

	function getRotationDurationMs() {
		return Math.max(1, getPosterCount()) * secondsPerCard * 1000;
	}

	function initializeRotationSpeedControl() {
		if (!rotationSpeedInput || !rotationSpeedValue) return;

		const storedSeconds = Number.parseInt(localStorage.getItem('autoRotateSecondsPerCard'), 10);
		const legacyDurationMs = Number.parseInt(localStorage.getItem('autoRotateDurationMs'), 10);
		const minSeconds = Number.parseInt(rotationSpeedInput.min, 10) || 5;
		const maxSeconds = Number.parseInt(rotationSpeedInput.max, 10) || 30;
		let nextSeconds = DEFAULT_SECONDS_PER_CARD;

		if (Number.isFinite(storedSeconds) && storedSeconds > 0) {
			nextSeconds = storedSeconds;
		} else if (Number.isFinite(legacyDurationMs) && legacyDurationMs > 0) {
			nextSeconds = Math.round((legacyDurationMs / 1000) / getPosterCount());
			localStorage.removeItem('autoRotateDurationMs');
		}

		nextSeconds = Math.min(Math.max(nextSeconds, minSeconds), maxSeconds);
		secondsPerCard = nextSeconds;
		rotationSpeedInput.value = nextSeconds;
		rotationSpeedValue.textContent = `${nextSeconds}s`;
		localStorage.setItem('autoRotateSecondsPerCard', `${nextSeconds}`);

		rotationSpeedInput.addEventListener('input', () => {
			const nextValue = Number.parseInt(rotationSpeedInput.value, 10) || DEFAULT_SECONDS_PER_CARD;
			secondsPerCard = nextValue;
			rotationSpeedValue.textContent = `${nextValue}s`;
			localStorage.setItem('autoRotateSecondsPerCard', `${nextValue}`);
		});

		window.addEventListener('storage', (event) => {
			if (event.key === 'autoRotateSecondsPerCard' && event.newValue) {
				const syncedValue = Number.parseInt(event.newValue, 10);
				if (Number.isFinite(syncedValue) && syncedValue > 0) {
					secondsPerCard = syncedValue;
					rotationSpeedInput.value = syncedValue;
					rotationSpeedValue.textContent = `${syncedValue}s`;
				}
			}
		});
	}

	function stepAutoRotate(timestamp) {
		if (!autoRotateActive) return;
		if (!lastAutoRotateTime) lastAutoRotateTime = timestamp;
		const deltaSeconds = (timestamp - lastAutoRotateTime) / 1000;
		lastAutoRotateTime = timestamp;
		const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
		if (scrollHeight > 0) {
			const distancePerSecond = scrollHeight / (getRotationDurationMs() / 1000);
			const nextScrollTop = (window.scrollY || window.pageYOffset) + (distancePerSecond * deltaSeconds);
			window.scrollTo(0, nextScrollTop);
		}
		autoRotateId = requestAnimationFrame(stepAutoRotate);
	}

	function startAutoRotate() {
		if (autoRotateActive || userInputPaused) return;
		autoRotateActive = true;
		lastAutoRotateTime = 0;
		autoRotateId = requestAnimationFrame(stepAutoRotate);
	}

	function stopAutoRotate() {
		autoRotateActive = false;
		if (autoRotateId) {
			cancelAnimationFrame(autoRotateId);
			autoRotateId = null;
		}
		lastAutoRotateTime = 0;
	}

	window.stopAutoRotate = stopAutoRotate;

	function pauseAutoRotateForUserInput() {
		userInputPaused = true;
		stopAutoRotate();
	}

	// ── Hi-res back overlay ──────────────────────────────────────────
	const backOverlay      = document.getElementById('back-overlay');
	const backOverlayFrame = document.getElementById('back-overlay-frame');
	let backOverlayTimer   = null;

	function showBackOverlay(article) {
		const backContent = article.querySelector('.v2-back-content');
		if (!backContent) return;
		clearTimeout(backOverlayTimer);
		// Wait for the card flip animation (~350ms) then show the hi-res clone
		backOverlayTimer = setTimeout(() => {
			// Anchor the overlay to the on-screen size of the carousel back it
			// replaces. getBoundingClientRect already reflects the article's
			// scale(3); the computed font-size is the layout value, so multiply
			// by the same factor to keep the clone's em-based internals in
			// proportion when rendered natively at the larger size.
			const rect = backContent.getBoundingClientRect();
			const HOV_SCALE = 3; // 1 + --hov*2 with --hov:1 (see carousel.css)
			const baseFs = parseFloat(getComputedStyle(backContent).fontSize) * HOV_SCALE;
			backOverlayFrame.style.setProperty('--ov-base-w', `${rect.width}px`);
			backOverlayFrame.style.setProperty('--ov-base-h', `${rect.height}px`);
			backOverlayFrame.style.setProperty('--ov-base-fs', `${baseFs}px`);
			backOverlayFrame.classList.remove('text-expanded', 'image-expanded');
			backOverlayFrame.innerHTML = '';
			backOverlayFrame.appendChild(backContent.cloneNode(true));
			backOverlay.classList.add('visible');
		}, 350);
	}

	function hideBackOverlay() {
		clearTimeout(backOverlayTimer);
		backOverlay.classList.remove('visible');
		backOverlayFrame.classList.remove('text-expanded', 'image-expanded');
		setTimeout(() => {
			if (!backOverlay.classList.contains('visible')) backOverlayFrame.innerHTML = '';
		}, 300);
	}

	backOverlay.addEventListener('click', (e) => {
		if (e.target === backOverlay) {
			hideBackOverlay();
			document.querySelectorAll('article').forEach(a => {
				a.style.removeProperty('--hov');
				a.classList.remove('text-expanded', 'image-expanded');
			});
		}
	});

	// Function to open full article
	function openFullArticle(article) {
		const fullArticle = document.querySelector('.full-article');
		const mainContent = document.querySelector('main');
		const articleTitle = article.querySelector('figure div').textContent;

		// Hide main content
		mainContent.classList.add('main-hidden');

		// Set and show full article
		fullArticle.querySelector('.article-title').textContent = articleTitle;
		fullArticle.style.display = 'block';

		// Prevent body scrolling
		document.body.style.overflow = 'hidden';
	}

	// Function to close full article
	function closeFullArticle() {
		const fullArticle = document.querySelector('.full-article');
		const mainContent = document.querySelector('main');

		// Hide full article
		fullArticle.style.display = 'none';

		// Show main content
		mainContent.classList.remove('main-hidden');

		// Restore body scrolling
		document.body.style.overflow = '';
	}

	// Click handler for articles
	document.addEventListener('click', (e) => {
		const imagePanel = e.target.closest('.v2-back-image-panel');
		if (imagePanel) {
			// State host: the overlay frame (when interacting with the hi-res
			// clone) or the carousel article. Both carry the same expand classes.
			const host = imagePanel.closest('#back-overlay-frame') || imagePanel.closest('article');
			if (host) {
				const isOpen = host.id === 'back-overlay-frame'
					? backOverlay.classList.contains('visible')
					: host.style.getPropertyValue('--hov') === '1';
				if (isOpen) {
					const isExpanded = host.classList.contains('image-expanded');
					const isPanelTitle = Boolean(e.target.closest('.v2-back-panel-title'));

					// Parse the image list once
					let imageList = [];
					const imagesData = imagePanel.dataset.images;
					if (imagesData) {
						try { imageList = JSON.parse(decodeURIComponent(imagesData)); } catch (_) {}
					}
					const isMulti = imageList.length > 1;

					if (!isExpanded) {
						// Any click while collapsed → expand
						host.classList.remove('text-expanded');
						host.classList.add('image-expanded');
					} else if (isPanelTitle) {
						// Click on the "Image" label while expanded → collapse
						host.classList.remove('image-expanded');
					} else if (isMulti) {
						// Click on image area while expanded → cycle to next image
						const imgEl = imagePanel.querySelector('img');
						const currentIndex = Number.parseInt(imagePanel.dataset.imageIndex || '0', 10) || 0;
						const nextIndex = (currentIndex + 1) % imageList.length;
						const nextImage = imageList[nextIndex];
						if (imgEl && nextImage) {
							imgEl.src = nextImage.src;
							imgEl.alt = nextImage.alt || '';
							applyImageSizing(imgEl, nextImage);
							imagePanel.dataset.imageIndex = `${nextIndex}`;
						}
					} else {
						// Single image, already expanded → collapse
						host.classList.remove('image-expanded');
					}
				}
				e.stopPropagation();
				return;
			}
		}

		const textPanel = e.target.closest('.v2-back-text-panel');
		if (textPanel) {
			const host = textPanel.closest('#back-overlay-frame') || textPanel.closest('article');
			if (host) {
				const isOpen = host.id === 'back-overlay-frame'
					? backOverlay.classList.contains('visible')
					: host.style.getPropertyValue('--hov') === '1';
				const isLink = Boolean(e.target.closest('a'));
				if (isOpen && !isLink) {
					host.classList.remove('image-expanded');
					host.classList.toggle('text-expanded');
				}
				e.stopPropagation();
				return;
			}
		}

		// Close article logic should be fine
		if (e.target.closest('.close-article')) {
			closeFullArticle();
		}

		// Handle poster flipping / opening
		const clickedArticle = e.target.closest('article');
		if (clickedArticle) {
			stopAutoRotate();
			const articles = Array.from(postersContainer.querySelectorAll('article'));
			const k = parseFloat(getComputedStyle(document.body).getPropertyValue('--k'));
			const index = articles.indexOf(clickedArticle);

			if (index !== -1) {
				const j = index / articles.length;
				const diff = Math.abs(j - ((k + 1) % 1));

				if (diff < 0.05) { // Only allow interaction with the centered poster
					if (e.shiftKey) {
						openFullArticle(clickedArticle);
					} else {
						const currentHov = clickedArticle.style.getPropertyValue('--hov');
						// Reset other posters
						articles.forEach(otherArticle => {
							if (otherArticle !== clickedArticle) {
								otherArticle.style.removeProperty('--hov');
								otherArticle.classList.remove('text-expanded');
								otherArticle.classList.remove('image-expanded');
							}
						});
						// Toggle clicked poster
						if (currentHov === '1') {
							clickedArticle.style.removeProperty('--hov');
							clickedArticle.classList.remove('text-expanded');
							clickedArticle.classList.remove('image-expanded');
							hideBackOverlay();
						} else {
							clickedArticle.style.setProperty('--hov', '1');
							showBackOverlay(clickedArticle);
						}
					}
				}
			}
		}
	});

	// Keyboard handler
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			closeFullArticle();
			hideBackOverlay();
			document.querySelectorAll('article').forEach(a => {
				a.style.removeProperty('--hov');
				a.classList.remove('text-expanded', 'image-expanded');
			});
			return;
		}

		if (e.key === 'Enter') {
			const centeredArticle = document.querySelector('article.centered');
			if (centeredArticle) {
				if (e.shiftKey) {
					openFullArticle(centeredArticle);
				} else {
					const currentHov = centeredArticle.style.getPropertyValue('--hov');

					// First, reset all other posters
					document.querySelectorAll('article').forEach(article => {
						if (article !== centeredArticle) {
							article.style.removeProperty('--hov');
							article.classList.remove('text-expanded');
							article.classList.remove('image-expanded');
						}
					});

					// Then toggle the centered poster
					if (currentHov === '1') {
						centeredArticle.style.removeProperty('--hov');
						centeredArticle.classList.remove('text-expanded');
						centeredArticle.classList.remove('image-expanded');
						hideBackOverlay();
					} else {
						centeredArticle.style.setProperty('--hov', '1');
						showBackOverlay(centeredArticle);
					}
				}
			}
		}
	});

	// Function to populate directory/journey chooser
	async function populateChooser() {
		try {
			const response = await fetch('/api/load-options');
			if (!response.ok) {
				throw new Error(`Server returned ${response.status}: ${response.statusText}`);
			}
			const optionsData = await response.json();

			chooser.innerHTML = ''; // Clear existing options

			const categoriesGroup = document.createElement('optgroup');
			categoriesGroup.label = 'Categories';
			const journeysGroup = document.createElement('optgroup');
			journeysGroup.label = 'Journeys';

			let hasCategories = false;
			let hasJourneys = false;

			optionsData.forEach(item => {
				const option = document.createElement('option');
				option.value = item.value;
				option.textContent = item.name;
				option.dataset.type = item.type; // Store type ('directory' or 'journey')

				if (item.type === 'category') {
					categoriesGroup.appendChild(option);
					hasCategories = true;
				} else if (item.type === 'journey') {
					journeysGroup.appendChild(option);
					hasJourneys = true;
				}
			});

			if (hasCategories) {
				chooser.appendChild(categoriesGroup);
			}
			if (hasJourneys) {
				chooser.appendChild(journeysGroup);
			}

			// Trigger change event to load the default selection
			if (chooser.options.length > 0) {
				chooser.dispatchEvent(new Event('change'));
			}

		} catch (error) {
			console.error('Error populating chooser:', error);
			postersContainer.innerHTML = `<p style="color: red;">Error loading options: ${error.message}</p>`;
		}
	}

	// ── Elevator transition (category / journey switch) ──────────────
	const sceneEl   = document.querySelector('main.scene');
	const liveLayer = document.getElementById('live-layer');
	let activeElevator = null;

	function snapElevator() {
		if (activeElevator) {
			try { activeElevator.incoming.cancel(); } catch (_) {}
			activeElevator = null;
		}
		if (sceneEl) sceneEl.querySelectorAll('.elevator-out').forEach(n => n.remove());
		if (liveLayer) liveLayer.style.transform = '';
	}

	// Swap carousel content via renderFn while sliding the old set down and out
	// of the bottom and the new set down into view from above. Falls back to an
	// instant swap when the layers are missing or the user prefers reduced motion.
	async function runElevatorTransition(renderFn) {
		// Dismiss any open hi-res back overlay + reset poster state first.
		hideBackOverlay();
		document.querySelectorAll('article').forEach(a => {
			a.style.removeProperty('--hov');
			a.classList.remove('text-expanded', 'image-expanded');
		});

		// Nothing to slide out from on the very first load (or after an error
		// left the carousel empty) — render instantly in those cases.
		const hasExisting = liveLayer && liveLayer.querySelector('article');
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduce || !liveLayer || !sceneEl || !hasExisting) {
			await renderFn();
			window.scrollTo(0, 0);
			return;
		}

		// Snap any in-flight transition before starting a new one.
		snapElevator();

		// 1. Clone the current carousel, frozen at the live --k/--n so it stops
		//    rotating when we reset scroll for the incoming set.
		const bodyStyle = getComputedStyle(document.body);
		const outClone = liveLayer.cloneNode(true);
		outClone.classList.add('elevator-out');
		outClone.removeAttribute('id');
		outClone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
		outClone.style.setProperty('--k', bodyStyle.getPropertyValue('--k').trim() || '0');
		outClone.style.setProperty('--n', bodyStyle.getPropertyValue('--n').trim() || '1');
		outClone.style.transform = 'translateY(0)';
		sceneEl.appendChild(outClone);

		// 2. Render the new set into the real layer, reset to its first poster.
		await renderFn();
		window.scrollTo(0, 0);

		// Park the incoming layer above the shaft, then animate both down together.
		liveLayer.style.transform = 'translateY(-100%)';
		void liveLayer.offsetHeight; // commit start position (avoids a flash)

		const EASE = 'cubic-bezier(.22, .61, .36, 1)';
		const DURATION = 900;
		const incoming = liveLayer.animate(
			[{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }],
			{ duration: DURATION, easing: EASE }
		);
		outClone.animate(
			[{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }],
			{ duration: DURATION, easing: EASE, fill: 'forwards' }
		);
		liveLayer.style.transform = ''; // resting state once the animation owns it

		const token = { incoming, outClone };
		activeElevator = token;

		// 3. Cleanup when this transition (if still current) finishes.
		try { await incoming.finished; } catch (_) { /* cancelled by a newer switch */ }
		if (activeElevator === token) {
			outClone.remove();
			activeElevator = null;
		}
	}

	// Event listener for the chooser dropdown
	chooser.addEventListener('change', async (event) => {
		const selectedOption = event.target.options[event.target.selectedIndex];
		const type = selectedOption.dataset.type;
		const value = selectedOption.value;

		if (!type || !value) {
			console.error('Selected option is missing type or value.');
			postersContainer.innerHTML = '<p style="color: red;">Error: Invalid selection.</p>';
			return;
		}

		stopAutoRotate();
		userInputPaused = false;
		// Keep the current carousel on screen during the fetch so it can be
		// cloned for the outgoing half of the elevator transition.

		try {
			let postersData = [];

			if (type === 'category') {
				// Load posters from a category
				const response = await fetch(`/api/posters-in-category?category=${encodeURIComponent(value)}`);
				if (!response.ok) {
					throw new Error(`Failed to load category ${value}: ${response.status} ${response.statusText}`);
				}
				postersData = await response.json();

			} else if (type === 'journey') {
				// Load posters from a journey
				// 1. Fetch the journey file
				const journeyResponse = await fetch(`/api/journey/${value}`);
				if (!journeyResponse.ok) {
					throw new Error(`Failed to load journey ${value}: ${journeyResponse.status} ${journeyResponse.statusText}`);
				}
				const journeyData = await journeyResponse.json();

				// 2. Extract filenames
				const filenames = journeyData.posters?.map(p => p.filename).filter(Boolean) || [];

				// 3. Fetch posters by filenames if there are any
				if (filenames.length > 0) {
					const postersResponse = await fetch('/api/posters-by-filenames', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({ filenames })
					});
					if (!postersResponse.ok) {
						throw new Error(`Failed to load posters for journey ${value}: ${postersResponse.status} ${postersResponse.statusText}`);
					}
					postersData = await postersResponse.json();
				} else {
					postersData = []; // Journey is empty
				}
			}

			// Slide the new set in (elevator) while the old set slides out.
			await runElevatorTransition(async () => {
				if (window.loadPosters) {
					await window.loadPosters(postersData);
				} else {
					throw new Error('loadPosters function is not defined globally.');
				}
			});

			startAutoRotate();

		} catch (error) {
			console.error('Error loading posters:', error);
			snapElevator();
			postersContainer.innerHTML = `<p style="color: red;">Error loading posters: ${error.message}</p>`;
		}
	});

	window.addEventListener('wheel', () => pauseAutoRotateForUserInput(), { passive: true });
	window.addEventListener('touchstart', () => pauseAutoRotateForUserInput(), { passive: true });
	initializeRotationSpeedControl();

	// Initialize the chooser and load initial posters
	populateChooser();

	// Update centered article logic
	function updateCenteredArticle() {
		const articles = document.querySelectorAll('article');
		const k = parseFloat(getComputedStyle(document.body).getPropertyValue('--k'));

		console.log(`[updateCenteredArticle] k=${k.toFixed(4)}, articles=${articles.length}`);

		// Remove centered class from all articles
		articles.forEach(article => article.classList.remove('centered'));

		if (articles.length === 0) {
			console.log('[updateCenteredArticle] No articles found');
			return;
		}

		// Find the most centered article
		let closestArticle = null;
		let smallestDiff = Infinity;
		let closestIndex = -1;

		articles.forEach((article, index) => {
			const j = index / articles.length;
			const diff = Math.abs(j - ((k + 1) % 1));

			if (diff < smallestDiff) {
				smallestDiff = diff;
				closestArticle = article;
				closestIndex = index;
			}
		});

		// Increase threshold based on number of articles
		const threshold = Math.max(0.05, 1 / articles.length);

		console.log(`[updateCenteredArticle] Closest index=${closestIndex}, diff=${smallestDiff.toFixed(4)}, threshold=${threshold.toFixed(4)}`);

		// Add centered class if article is within threshold
		if (closestArticle && smallestDiff < threshold) {
			closestArticle.classList.add('centered');
			console.log(`[updateCenteredArticle] Applied .centered to article ${closestIndex}`);
		} else {
			console.log(`[updateCenteredArticle] No article within threshold (diff=${smallestDiff.toFixed(4)} >= threshold=${threshold.toFixed(4)})`);
		}
	}

	// Expose to window for loadPosters.js to call
	window.updateCenteredArticle = updateCenteredArticle;

	// Scroll event listener
	addEventListener('scroll', e => {
		f(+getComputedStyle(document.body).getPropertyValue('--k'));
		updateCenteredArticle();
	});

	// Initial call for scroll position and centered article
	f(-1);
	updateCenteredArticle();
	startAutoRotate();

	// === V2 POSTER NAVIGATION UTILITIES ===

	/**
	 * Navigate to an internal poster by path
	 * Format: "poster:Category/Filename.json" or "Category/Filename.json"
	 */
	window.navigateToPoster = function (target) {
		const posterPath = target.replace(/^poster:/, '');
		const fullPath = posterPath.startsWith('JSON_Posters/') ? posterPath : `JSON_Posters/${posterPath}`;

		// Find the matching article
		const articles = postersContainer.querySelectorAll('article');
		let targetArticle = null;
		let targetIndex = -1;

		articles.forEach((article, index) => {
			// Check if this article has data matching the path
			const articlePath = article.dataset.posterPath;
			if (articlePath && (articlePath === fullPath || articlePath.endsWith(posterPath))) {
				targetArticle = article;
				targetIndex = index;
			}
		});

		if (targetArticle) {
			// Calculate scroll position to center this article
			const n = articles.length;
			const targetK = targetIndex / n;
			const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
			const targetScroll = targetK * scrollHeight;

			window.scrollTo({
				top: targetScroll,
				behavior: 'smooth'
			});

			// Flash the article to highlight it
			targetArticle.classList.add('highlight-flash');
			setTimeout(() => targetArticle.classList.remove('highlight-flash'), 1500);
		} else {
			// Poster not in current view - need to load its category first
			console.log(`Poster not found in current view: ${fullPath}`);
			const category = posterPath.split('/')[0];
			if (category && chooser) {
				// Try to switch to the category that contains this poster
				const optionToSelect = Array.from(chooser.options).find(opt =>
					opt.dataset.type === 'category' && opt.value.toLowerCase() === category.toLowerCase()
				);
				if (optionToSelect) {
					chooser.value = optionToSelect.value;
					chooser.dispatchEvent(new Event('change'));
					// After loading, try to navigate again
					setTimeout(() => window.navigateToPoster(target), 1000);
				} else {
					alert(`Could not find poster: ${posterPath}`);
				}
			}
		}
	};

	/**
	 * Open a local file with system default application
	 * Requires server-side support
	 */
	window.openLocalFile = function (filepath) {
		fetch('/api/open-file', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: filepath })
		})
			.then(res => {
				if (!res.ok) throw new Error('Failed to open file');
				console.log(`Opening file: ${filepath}`);
			})
			.catch(err => {
				console.error('Error opening file:', err);
				alert(`Cannot open file: ${filepath}\n\nThis feature requires desktop integration.`);
			});
	};

	/**
	 * Launch a desktop application
	 * Requires server-side support
	 */
	window.launchApp = function (command, args = []) {
		fetch('/api/launch-app', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ command, args })
		})
			.then(res => {
				if (!res.ok) throw new Error('Failed to launch app');
				console.log(`Launching: ${command} ${args.join(' ')}`);
			})
			.catch(err => {
				console.error('Error launching app:', err);
				alert(`Cannot launch: ${command}\n\nThis feature requires desktop integration.`);
			});
	};
});
