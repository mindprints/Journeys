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
    
    // Map to keep track of images we've already included
    // This will help us avoid duplicate images (direct image and JSON wrapped)
    const includedImages = new Set();
    
    // First prioritize loading JSON files to get all JSON-wrapped posters
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
          // If the JSON has a specific type field, use it; otherwise, default to 'json'
          const type = posterData.type || 'json';
          
          // If this is an image JSON wrapper, remember the image path
          if (type === 'image' && posterData.imagePath) {
            // Extract the image filename and add to tracked images
            const imagePath = posterData.imagePath;
            includedImages.add(imagePath);
          }
          
          postersData.push({ type, data: posterData, path: filePath });
        } catch (jsonError) {
            console.warn(`Failed to parse JSON poster: ${filePath}`, jsonError);
            continue; // Skip if JSON parsing fails
        }
      }
    }
    
    // Check if there's an images subdirectory
    const imagesDir = `${directory}/images`;
    const imagesDirectoryResponse = await fetch(`/api/check-directory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: imagesDir })
    });
    
    if (imagesDirectoryResponse.ok) {
      const dirCheckResult = await imagesDirectoryResponse.json();
      
      // If images directory exists, fetch its contents
      if (dirCheckResult.exists) {
        const imagesResponse = await fetch(`/api/posters?directory=${imagesDir}`);
        if (imagesResponse.ok) {
          const imagesFileList = await imagesResponse.json();
          
          // Process images from images subdirectory
          for (let i = 0; i < imagesFileList.length; i++) {
            const fileName = imagesFileList[i];
            const filePath = `${imagesDir}/${fileName}`;
            const fileExt = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
            
            // Check if this image is already included via a JSON wrapper
            if (includedImages.has(filePath)) {
              continue; // Skip - this image is already included via JSON
            }
            
            if (imageExtensions.includes(fileExt)) {
              postersData.push({ type: 'direct-image', path: filePath });
            }
          }
        }
      }
    }
    
    // Now handle direct images in the main directory as a fallback
    for (let i = 0; i < fileList.length; i++) {
      const fileName = fileList[i];
      const filePath = `${directory}/${fileName}`;
      const fileExt = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
      
      // Check if this image is already included via a JSON wrapper
      if (includedImages.has(filePath)) {
        continue; // Skip - this image is already included via JSON
      }

      if (imageExtensions.includes(fileExt)) {
        postersData.push({ type: 'direct-image', path: filePath });
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
      
      // Fallback: Sort everything else (images, JSONs without chrono, websites) by path alphabetically
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
            figureHTML += `<div class="timeline-dates"><span class="timeline-start">${posterData.chronology.epochStart}</span></div>`;
          } else if (hasEnd) {
            figureHTML += `<div class="timeline-dates"><span class="timeline-end">${posterData.chronology.epochEnd}</span></div>`;
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
        // Get the image data from the JSON wrapper
        const imageData = poster.data;
        const imagePath = imageData.imagePath;
        const title = imageData.title || '';
        const description = imageData.description || '';
        const altText = imageData.alt || imagePath.split('/').pop();
        
        // Create header (back side) - Display the image and description
        header.classList.add('image-poster-header');
        
        // Create a container for the image and description
        const imageContainer = document.createElement('div');
        imageContainer.classList.add('image-container');
        
        // Add the image
        const headerImg = document.createElement('img');
        headerImg.src = imagePath;
        headerImg.alt = altText;
        headerImg.classList.add('fullsize-image');
        imageContainer.appendChild(headerImg);
        
        // Add description if available
        if (description) {
          const descriptionElem = document.createElement('div');
          descriptionElem.classList.add('image-description');
          descriptionElem.innerHTML = `<p>${description}</p>`;
          imageContainer.appendChild(descriptionElem);
        }
        
        header.appendChild(imageContainer);

        // Create figure (front side) - Image with optional title
        figure.classList.add('image-poster-figure');
        
        // Add the image
        const img = document.createElement('img');
        img.src = imagePath;
        img.alt = altText;
        figure.appendChild(img);
        
        // Add title if available
        if (title) {
          const titleElem = document.createElement('div');
          titleElem.classList.add('title');
          titleElem.textContent = title;
          figure.appendChild(titleElem);
        }
        
        // Add annotations if available
        if (imageData.annotations && imageData.annotations.length > 0) {
          const annotationsContainer = document.createElement('div');
          annotationsContainer.classList.add('annotations-container');
          
          imageData.annotations.forEach(annotation => {
            const annotationElem = document.createElement('div');
            annotationElem.classList.add('annotation');
            annotationElem.textContent = annotation.text;
            
            // Position the annotation if position data is available
            if (annotation.position) {
              annotationElem.style.position = 'absolute';
              annotationElem.style.left = `${annotation.position.x}%`;
              annotationElem.style.top = `${annotation.position.y}%`;
            }
            
            annotationsContainer.appendChild(annotationElem);
          });
          
          figure.appendChild(annotationsContainer);
        }
      } else if (poster.type === 'direct-image') {
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
      } else if (poster.type === 'website') {
        const websiteData = poster.data;
        
        // Create header (back side) - Website preview with link
        header.classList.add('website-poster-header');
        
        // Create a container for the website preview
        const previewContainer = document.createElement('div');
        previewContainer.classList.add('website-preview-container');
        
        // Get domain info for display
        const urlObj = new URL(websiteData.url);
        const domain = urlObj.hostname;
        
        // Add website information
        const websiteInfo = document.createElement('div');
        websiteInfo.classList.add('website-info');
        
        // Create site icon if possible (favicon)
        const iconContainer = document.createElement('div');
        iconContainer.classList.add('website-icon');
        
        // Try to get favicon from the domain
        const faviconUrl = `https://${domain}/favicon.ico`;
        const favicon = document.createElement('img');
        favicon.src = faviconUrl;
        favicon.alt = '';
        favicon.onerror = () => {
          // If favicon fails, use default logo
          favicon.src = 'logos/favicon_io/favicon-32x32.png';
        };
        iconContainer.appendChild(favicon);
        
        websiteInfo.innerHTML = `
          <h2>${websiteData.title || domain}</h2>
          <p class="website-url">${websiteData.url}</p>
          <p class="website-description">${websiteData.description || 'View this website in a new tab'}</p>
          <div class="website-buttons">
            <a href="${websiteData.url}" target="_blank" rel="noopener noreferrer" class="website-open-button">Open Website</a>
          </div>
        `;
        
        // Add icon to the top of the info
        websiteInfo.insertBefore(iconContainer, websiteInfo.firstChild);
        
        previewContainer.appendChild(websiteInfo);
        header.appendChild(previewContainer);

        // Create figure (front side) - Title or Thumbnail
        figure.classList.add('website-poster-figure');
        
        // Create the frontside container for better organization
        const frontsideContainer = document.createElement('div');
        frontsideContainer.classList.add('website-frontside-container');
        
        // Create site icon for the frontside
        const frontIconContainer = document.createElement('div');
        frontIconContainer.classList.add('website-frontside-icon');
        
        // Create favicon for the frontside (reusing the same favicon URL)
        const frontFavicon = document.createElement('img');
        frontFavicon.src = faviconUrl;
        frontFavicon.alt = '';
        frontFavicon.onerror = () => {
          // If favicon fails, use default logo
          frontFavicon.src = 'logos/favicon_io/favicon-32x32.png';
        };
        frontIconContainer.appendChild(frontFavicon);
        
        // Create the title elements (we'll always create these for fallback)
        const websiteTitle = document.createElement('div');
        websiteTitle.classList.add('title');
        websiteTitle.textContent = websiteData.title || domain;
        
        // Add description instead of URL
        const websiteDesc = document.createElement('div');
        websiteDesc.classList.add('website-brief-description');
        
        // Only show description if it's explicitly provided
        if (websiteData.description) {
          websiteDesc.textContent = websiteData.description;
          // Make container to hold the description
          frontsideContainer.appendChild(websiteDesc);
        }
        
        // Check if thumbnail is specified and is not a placeholder
        const thumbnailPath = websiteData.thumbnail;
        const isPlaceholder = !thumbnailPath || 
                             thumbnailPath === 'path/to/optional/thumbnail.png' ||
                             thumbnailPath.includes('/optional/') ||
                             thumbnailPath.startsWith('path/to/') ||
                             thumbnailPath === 'thumbnail.png';
        
        if (thumbnailPath && !isPlaceholder) {
          // Create a container for the thumbnail that we can show/hide
          const thumbContainer = document.createElement('div');
          thumbContainer.classList.add('thumbnail-container');
          
          // Create the thumbnail image
          const thumbImg = document.createElement('img');
          thumbImg.alt = websiteData.title || 'Website Thumbnail';
          thumbImg.classList.add('website-thumbnail');
          
          // Use a default placeholder while waiting for the real thumbnail
          thumbImg.src = 'logos/favicon_io/android-chrome-512x512.png';
          
          // Add error handling for the thumbnail
          const tryLoadThumbnail = () => {
            // First try the specified thumbnail
            const testImg = new Image();
            
            testImg.onload = () => {
              // If it loads successfully, use it
              thumbImg.src = thumbnailPath;
              thumbContainer.style.display = 'block';
              frontsideContainer.style.display = 'none';
            };
            
            testImg.onerror = () => {
              // If it fails, remove the thumbnail and show the title instead
              thumbContainer.style.display = 'none';
              frontsideContainer.style.display = 'flex';
              console.warn(`Failed to load thumbnail: ${thumbnailPath}`);
            };
            
            // Start loading the test image
            testImg.src = thumbnailPath;
          };
          
          // Start the thumbnail loading process
          tryLoadThumbnail();
          
          // Add everything to the DOM
          thumbContainer.appendChild(thumbImg);
          figure.appendChild(thumbContainer);
        } else {
          // No valid thumbnail, ensure frontside container is visible
          frontsideContainer.style.display = 'flex';
        }
        
        // Add elements to the frontside container
        frontsideContainer.appendChild(frontIconContainer);
        frontsideContainer.appendChild(websiteTitle);
        
        // Add the frontside container to the figure
        figure.appendChild(frontsideContainer);
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