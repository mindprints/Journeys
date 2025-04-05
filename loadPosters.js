// Define loadPosters in the global scope
async function loadPosters(directory) {
  const postersContainer = document.getElementById('posters-container');
  
  try {
    // Clear existing posters
    postersContainer.innerHTML = '';

    // Fetch the list of JSON files from the server
    const response = await fetch(`/api/posters?directory=${directory}`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    const fileList = await response.json();
    let postersData = [];
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

    // Load data for all potential posters
    for (let i = 0; i < fileList.length; i++) {
      const fileName = fileList[i];
      const filePath = `${directory}/${fileName}`;
      const fileExt = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();

      if (fileExt === '.json') {
        try {
          const posterResponse = await fetch(filePath);
          if (!posterResponse.ok) {
            console.warn(`Failed to load JSON poster: ${filePath}, Status: ${posterResponse.status}`);
            continue; // Skip this file if fetch fails
          }
          const posterData = await posterResponse.json();
          postersData.push({ type: 'json', data: posterData, path: filePath }); 
        } catch (jsonError) {
            console.warn(`Failed to parse JSON poster: ${filePath}`, jsonError);
            continue; // Skip if JSON parsing fails
        }
      } else if (imageExtensions.includes(fileExt)) {
        postersData.push({ type: 'image', path: filePath });
      } else {
        console.warn(`Skipping unsupported file type: ${fileName}`);
      }
    }

    // Sort posters
    postersData.sort((a, b) => {
      const aIsJson = a.type === 'json';
      const bIsJson = b.type === 'json';
      const aHasChrono = aIsJson && a.data.chronology?.epochStart !== undefined;
      const bHasChrono = bIsJson && b.data.chronology?.epochStart !== undefined;

      // Both have epochStart, sort by it
      if (aHasChrono && bHasChrono) {
        return a.data.chronology.epochStart - b.data.chronology.epochStart;
      }
      
      // Only A has epochStart, A comes first
      if (aHasChrono) return -1;
      // Only B has epochStart, B comes first
      if (bHasChrono) return 1;

      // Try sorting by earliest epochEvent year if both are JSON and lack epochStart
      if (aIsJson && bIsJson) {
        const aEarliestEvent = a.data.chronology?.epochEvents?.[0]?.year;
        const bEarliestEvent = b.data.chronology?.epochEvents?.[0]?.year;
        if (aEarliestEvent !== undefined && bEarliestEvent !== undefined) {
          return aEarliestEvent - bEarliestEvent;
        }
        // If only one has events, prioritize it (optional, could also sort by path)
         if (aEarliestEvent !== undefined) return -1;
         if (bEarliestEvent !== undefined) return 1;
      }
      
      // Fallback: Sort everything else (images, JSONs without chrono) by path alphabetically
      return a.path.localeCompare(b.path);
    });

    // Create DOM elements for each poster in sorted order
    for (let i = 0; i < postersData.length; i++) {
      const poster = postersData[i];
      
      const article = document.createElement('article');
      article.style.setProperty('--i', i); // Set --i based on the sorted index

      const header = document.createElement('header');
      const figure = document.createElement('figure');

      if (poster.type === 'json') {
        const posterData = poster.data;
        // Create header (back side) - JSON
        if (posterData.header) {
          let formattedText = posterData.header;
          if (formattedText.includes('\\n\\n')) {
            formattedText = formattedText.replace(/\\n\\n/g, '</p><p>');
            header.innerHTML = `<p>${formattedText}</p>`;
          } else if (formattedText.includes('\n\n')) {
            const paragraphs = formattedText.split('\n\n');
            header.innerHTML = paragraphs.map(p => `<p>${p}</p>`).join('');
          } else {
            header.innerHTML = `<p>${formattedText}</p>`;
          }
        }

        // Create figure (front side) - JSON
        let figureHTML = `<div class="title">${posterData.figure}</div>`;
        if (posterData.chronology) {
          figureHTML += `<div class="chronology-display">`;
          const hasStart = posterData.chronology.epochStart !== null && posterData.chronology.epochStart !== undefined;
          const hasEnd = posterData.chronology.epochEnd !== null && posterData.chronology.epochEnd !== undefined;
          if (hasStart && hasEnd) {
            figureHTML += `<div class="timeline-dates"><span class="timeline-span">${posterData.chronology.epochStart} — ${posterData.chronology.epochEnd}</span></div>`;
          } else if (hasStart) {
            figureHTML += `<div class="timeline-start">${posterData.chronology.epochStart}</div>`;
          } else if (hasEnd) {
            figureHTML += `<div class="timeline-end">${posterData.chronology.epochEnd}</div>`;
          }
          if (posterData.chronology.epochEvents && posterData.chronology.epochEvents.length > 0) {
            figureHTML += `<div class="timeline-events">`;
            posterData.chronology.epochEvents.forEach(event => {
              figureHTML += `<div class="event"><span class="year">${event.year}</span>: ${event.name}</div>`;
            });
            figureHTML += `</div>`;
          }
          figureHTML += `</div>`;
        }
        figure.innerHTML = figureHTML;

      } else if (poster.type === 'image') {
         // Get filename for alt text
         const filename = poster.path.split('/').pop();
         
         // Create header (back side) - Display the image as well
         header.classList.add('image-poster-header');
         const headerImg = document.createElement('img');
         headerImg.src = poster.path;
         headerImg.alt = filename;
         headerImg.classList.add('fullsize-image'); // Add class for styling the backside image
         header.appendChild(headerImg);

         // Create figure (front side) - Image
         const img = document.createElement('img');
         img.src = poster.path;
         img.alt = filename;
         figure.appendChild(img);
         figure.classList.add('image-poster-figure');
      }

      article.appendChild(header);
      article.appendChild(figure);
      postersContainer.appendChild(article);
    }

    // Update the --n property to match the total number of posters
    document.documentElement.style.setProperty('--n', postersData.length);
  } catch (error) {
    console.error('Error loading posters:', error);
    postersContainer.innerHTML = `<p style="color: red;">Error loading posters: ${error.message}</p>`;
  }
}

// Export the function for use in other scripts
window.loadPosters = loadPosters; 