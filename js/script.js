function f(k) {
	if(Math.abs(k) > .5)
		scrollTo(0, .5*(k - Math.sign(k) + 1)*(document.documentElement.offsetHeight - window.innerHeight))
}

f(-1);

addEventListener('scroll', e => f(+getComputedStyle(document.body).getPropertyValue('--k')));

// Wait for DOM to be loaded
document.addEventListener('DOMContentLoaded', () => {
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

	// Click handler
	document.addEventListener('click', (e) => {
		const articles = document.querySelectorAll('article');
		const k = parseFloat(getComputedStyle(document.body).getPropertyValue('--k'));
		
		articles.forEach((article, index) => {
			if (article.contains(e.target)) {
				const j = index / articles.length;
				const diff = Math.abs(j - ((k + 1) % 1));
				
				if (diff < 0.05) {
					if (e.shiftKey) {
						openFullArticle(article);
					} else {
						const currentHov = article.style.getPropertyValue('--hov');
						
						// First, reset all posters
						articles.forEach(otherArticle => {
							if (otherArticle !== article) {
								otherArticle.style.removeProperty('--hov');
							}
						});
						
						// Then toggle the clicked poster
						if (currentHov === '1') {
							article.style.removeProperty('--hov');
						} else {
							article.style.setProperty('--hov', '1');
						}
					}
				}
			}
		});
	});

	// Keyboard handler
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			closeFullArticle();
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
						}
					});
					
					// Then toggle the centered poster
					if (currentHov === '1') {
						centeredArticle.style.removeProperty('--hov');
					} else {
						centeredArticle.style.setProperty('--hov', '1');
					}
				}
			}
		}
	});

	// Close button handler
	const closeButton = document.querySelector('.close-article');
	if (closeButton) {
		closeButton.addEventListener('click', closeFullArticle);
	}

	// Function to populate directory chooser
	async function populateDirectoryChooser() {
		try {
			const response = await fetch('/api/directories');
			if (!response.ok) {
				throw new Error(`Server returned ${response.status}: ${response.statusText}`);
			}
			
			const directories = await response.json();
			const chooser = document.getElementById('directory-chooser');
			
			// Clear existing options
			chooser.innerHTML = '';
			
			// Add each directory as an option
			directories.forEach(directory => {
				const option = document.createElement('option');
				option.value = `JSON_Posters/${directory}`;
				
				// Format the display name (convert camelCase or snake_case to Title Case)
				let displayName = directory
					.replace(/([A-Z])/g, ' $1') // Convert camelCase to spaces
					.replace(/_/g, ' ')         // Convert snake_case to spaces
					.replace(/^\w/, c => c.toUpperCase()); // Capitalize first letter
					
				option.textContent = displayName;
				chooser.appendChild(option);
			});
			
			// Select the first option by default
			if (chooser.options.length > 0) {
				chooser.selectedIndex = 0;
			}
		} catch (error) {
			console.error('Error loading directories:', error);
		}
	}

	// Add event listener for the dropdown menu
	const chooser = document.getElementById('directory-chooser');
	chooser.addEventListener('change', (event) => {
		loadPosters(event.target.value);
	});

	// Load the directories and initial posters
	populateDirectoryChooser().then(() => {
		// Load the posters for the selected directory
		const chooser = document.getElementById('directory-chooser');
		if (chooser.value) {
			loadPosters(chooser.value);
		} else {
			// Fallback to initialposters if nothing is selected
			loadPosters('JSON_Posters/initialposters');
		}
	});
});

function updateCenteredArticle() {
	const articles = document.querySelectorAll('article');
	const k = parseFloat(getComputedStyle(document.body).getPropertyValue('--k'));
	
	// Remove centered class from all articles
	articles.forEach(article => article.classList.remove('centered'));
	
	// Find the most centered article
	let closestArticle = null;
	let smallestDiff = Infinity;
	
	articles.forEach((article, index) => {
		const j = index / articles.length;
		const diff = Math.abs(j - ((k + 1) % 1));
		
		if (diff < smallestDiff) {
			smallestDiff = diff;
			closestArticle = article;
		}
	});
	
	// Add centered class if article is within threshold
	if (closestArticle && smallestDiff < 0.05) {
		closestArticle.classList.add('centered');
	}
}

// Call on scroll
addEventListener('scroll', e => {
	f(+getComputedStyle(document.body).getPropertyValue('--k'));
	updateCenteredArticle();
});

// Initial call
updateCenteredArticle();

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
