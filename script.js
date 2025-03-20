function f(k) {
	if(Math.abs(k) > .5)
		scrollTo(0, .5*(k - Math.sign(k) + 1)*(document.documentElement.offsetHeight - window.innerHeight))
}

f(-1);

addEventListener('scroll', e => f(+getComputedStyle(document.body).getPropertyValue('--k')))

// Add click handler
document.addEventListener('click', (e) => {
	// Log to verify click is detected
	console.log('Click detected');
	
	const articles = document.querySelectorAll('article');
	const k = parseFloat(getComputedStyle(document.body).getPropertyValue('--k'));
	
	articles.forEach((article, index) => {
		// Check if article contains the clicked element
		if (article.contains(e.target)) {
			console.log('Article clicked:', index);
			
			const titleOpacity = getComputedStyle(article.querySelector('header')).opacity;
			const j = index / articles.length;
			const diff = Math.abs(j - ((k + 1) % 1));
			
			console.log('Opacity:', titleOpacity, 'Diff:', diff);
			
			if (diff < 0.05) {
				console.log('Flipping article:', index);
				const currentHov = article.style.getPropertyValue('--hov');
				if (currentHov === '1') {
					article.style.removeProperty('--hov');
				} else {
					article.style.setProperty('--hov', '1');
				}
			}
		}
	});
});
