# Hugging Face Poster Generator

Automatically generates poster JSON files from Hugging Face model data - models, statistics, tags, and metadata.

## Why Hugging Face?

Hugging Face is perfect for your AI museum because:
- **50,000+ AI models** with rich metadata
- **Download statistics** showing model popularity
- **Task classifications** (text generation, image classification, etc.)
- **Model cards** with descriptions and use cases
- **Free API** with no authentication required
- **Active community** - models are constantly updated

## Features

- Fetches data from Hugging Face Models API
- Generates posters in your v2 schema format
- Includes download stats, likes, tags, and descriptions
- Supports 5 curated categories OR custom searches
- Same merge/enrich system as Wikipedia script
- No API key required

## Curated Categories (50 models)

1. **Popular Models** (10): BERT, GPT-2, CLIP, ResNet, etc.
2. **Text Generation** (10): GPT variants, Llama, Mistral, Falcon
3. **Image Models** (9): Stable Diffusion, CLIP, ViT, EfficientNet
4. **NLP Models** (10): BERT variants, RoBERTa, T5, ELECTRA
5. **Multimodal** (6): CLIP, BLIP, GIT, image captioning

## Usage

### 1. Basic - Generate all curated models

```bash
python huggingface_grab.py
```

### 2. Custom category with specific models

```bash
python huggingface_grab.py \
  --category "Diffusion Models" \
  --topics "runwayml/stable-diffusion-v1-5,stabilityai/stable-diffusion-2-1,CompVis/stable-diffusion-v1-4"
```

### 3. Search for models dynamically

```bash
# Search for "llama" models, get top 10
python huggingface_grab.py \
  --category "Llama Models" \
  --search "llama" \
  --count 10

# Filter by task
python huggingface_grab.py \
  --category "Image Classification" \
  --filter "image-classification" \
  --count 15
```

### 4. Limit count from curated lists

```bash
python huggingface_grab.py --count 20
```

### 5. Merge enrichment options

```bash
# Skip creating new, only enrich existing
python huggingface_grab.py --merge-only true

# Disable merge enrichment entirely  
python huggingface_grab.py --merge-enrich false
```

## Integration with Your Category Editor

Your category editor can call this script exactly like the Wikipedia one:

```javascript
// In your backend API endpoint
const response = await fetch('/api/run-huggingface-grab', {
  method: 'POST',
  body: JSON.stringify({
    category: "Text Generation Models",
    topics: ["gpt2", "EleutherAI/gpt-neo-2.7B", "meta-llama/Llama-2-7b-hf"],
    count: 10,
    mergeEnrich: true,
    mergeOnly: false
  })
});
```

## Model ID Format

Hugging Face models use the format: `organization/model-name`

Examples:
- `bert-base-uncased` (no organization)
- `openai/clip-vit-base-patch32`
- `meta-llama/Llama-2-7b-hf`
- `runwayml/stable-diffusion-v1-5`

## Finding Model IDs

1. Browse https://huggingface.co/models
2. Click a model
3. The URL shows the ID: `https://huggingface.co/{model-id}`
4. Or use the search feature in the script

## Common Tasks for Filtering

- `text-generation` - LLMs, GPT-style models
- `text-classification` - Sentiment analysis, categorization
- `image-classification` - ResNet, ViT, etc.
- `image-to-text` - Image captioning
- `text-to-image` - Stable Diffusion, DALL-E
- `automatic-speech-recognition` - Whisper, Wav2Vec
- `translation` - OPUS, MarianMT
- `summarization` - BART, PEGASUS
- `question-answering` - BERT QA, RoBERTa QA

## Poster Output Example

```json
{
  "version": 2,
  "type": "poster-v2",
  "uid": "...",
  "front": {
    "title": "Stable Diffusion V1 5",
    "subtitle": "Text To Image • by runwayml",
    "chronology": {
      "epochStart": 2022,
      "epochEnd": 2026,
      "epochEvents": [
        {
          "year": 2022,
          "name": "Model released on Hugging Face"
        }
      ]
    }
  },
  "back": {
    "layout": "text-only",
    "text": "Stable Diffusion is a latent text-to-image diffusion model...\n\n**Statistics:**\n- Downloads: 25,432,891\n- Likes: 12,456\n- Task: text-to-image\n- Tags: stable-diffusion, text-to-image, diffusers",
    "links": [
      {
        "type": "external",
        "label": "View on Hugging Face",
        "url": "https://huggingface.co/runwayml/stable-diffusion-v1-5",
        "primary": true
      }
    ]
  },
  "meta": {
    "created": "2026-02-09T...",
    "modified": "2026-02-09T...",
    "categories": ["Image Models", "Computer Vision"],
    "tags": ["runwayml/stable-diffusion-v1-5", "stable-diffusion", "text-to-image"],
    "source": "https://huggingface.co/runwayml/stable-diffusion-v1-5"
  }
}
```

## Advantages Over Wikipedia

✅ **Live data** - Download counts update constantly
✅ **More models** - 50,000+ vs Wikipedia's limited AI model coverage
✅ **Better metadata** - Task types, tags, model cards
✅ **Technical focus** - Made for AI practitioners
✅ **Active community** - New models added daily

## Combining with Wikipedia

Use both scripts together for comprehensive coverage:

**Wikipedia** for:
- AI pioneers (people)
- Historical milestones
- Concepts and theory
- Companies and organizations

**Hugging Face** for:
- Specific model implementations
- Modern architectures
- Download statistics
- Community-created variants

## Requirements

Same as Wikipedia script:
```bash
pip install requests --break-system-packages
```

## Rate Limiting

- 0.5 second delay between requests (faster than Wikipedia)
- Hugging Face API is generous with rate limits
- No authentication needed for read-only access

## Tips

1. **Start with curated lists** - Run without arguments to get 50 high-quality models
2. **Use search for discovery** - Find niche models in specific domains
3. **Combine categories** - Use `--category` to group related models
4. **Check statistics** - Popular models (high downloads) are usually better documented
5. **Browse first** - Visit https://huggingface.co/models to discover interesting models

## Next Steps

To integrate into your category editor:

1. Add Hugging Face as a source option in the dropdown
2. Update your backend to call this script instead of Wikipedia
3. Use the same merge/enrich logic
4. Optionally add search/filter UI elements

The API interface is identical to your Wikipedia script for seamless integration!
example commands; # Get all 50 curated models
python huggingface_grab.py

# Custom category
python huggingface_grab.py --category "Diffusion Models" --topics "runwayml/stable-diffusion-v1-5,stabilityai/stable-diffusion-2-1"

# Search for models
python huggingface_grab.py --search "llama" --count 10