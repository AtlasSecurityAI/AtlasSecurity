/**
 * Utility functions for the Google Apps Script Blog Publisher.
 */

/**
 * Extracts the publication date from the end of the document.
 * Iterates backwards to find the last non-empty paragraph and validates the date format.
 *
 * @param {GoogleAppsScript.Document.Body} body - The document body.
 * @return {Object|null} Object containing date details or null if not found.
 */
function extractDateFromEnd(body) {
  var paragraphs = body.getParagraphs();
  // Regex for "Month DD, YYYY" (e.g., "February 13, 2026")
  var datePattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/i;
  
  // Loop backwards through paragraphs
  for (var i = paragraphs.length - 1; i >= 0; i--) {
    var text = paragraphs[i].getText().trim();
    
    // Find last non-empty paragraph
    if (text.length > 0) {
      // Validate format
      if (datePattern.test(text)) {
        var date = new Date(text);
        var iso = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
        var display = Utilities.formatDate(date, Session.getScriptTimeZone(), "MMM dd, yyyy").toUpperCase();
        
        return {
          raw: text,
          iso: iso,
          display: display,
          index: i
        };
      } else {
        // Last non-empty paragraph is not a valid date
        Logger.log("Last paragraph found but not a valid date: " + text);
        return null;
      }
    }
  }
  return null;
}

// Test Cases for extractDateFromEnd:
// 1. Document ending with "February 13, 2026" -> Returns object with iso "2026-02-13"
// 2. Document ending with "End of article" -> Returns null
// 3. Empty document -> Returns null

/**
 * Fixes encoding issues where apostrophes are rendered as question marks.
 *
 * @param {string} text - The text to clean.
 * @return {string} The cleaned text.
 */
function fixEncoding(text) {
  if (!text) return "";
  
  // Replace ? between letters with apostrophe (e.g., "It?s" -> "It's")
  text = text.replace(/([a-zA-Z])\?([a-zA-Z])/g, "$1'$2");
  
  // Replace ? at word start with apostrophe (e.g., " ?tis" -> " 'tis")
  text = text.replace(/(^|\s)\?([a-zA-Z])/g, "$1'$2");
  
  return text;
}

// Test Cases for fixEncoding:
// 1. "It?s a sunny day" -> "It's a sunny day"
// 2. "Who knows? Maybe." -> "Who knows? Maybe." (No change, ? not between letters)
// 3. "?tis the season" -> "'tis the season"

/**
 * Generates a URL-friendly slug from a title.
 *
 * @param {string} title - The article title.
 * @return {string} The generated slug.
 */
function generateSlug(title) {
  if (!title) return "";
  
  return title.toString().toLowerCase()
    .replace(/'/g, "")              // Remove apostrophes
    .replace(/[^a-z0-9]+/g, "-")    // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, "");       // Trim hyphens
}

// Test Cases for generateSlug:
// 1. "Hello World!" -> "hello-world"
// 2. "It's a Great Day" -> "its-a-great-day"
// 3. "  Spaced   Out  " -> "spaced-out"

/**
 * Maps a category name to a specific color for UI display.
 *
 * @param {string} category - The category name.
 * @return {string} The color name.
 */
function getCategoryColor(category) {
  if (!category) return "gray";
  
  var map = {
    "AI Security": "purple",
    "Cloud Security": "blue",
    "Governance": "indigo",
    "Risk": "orange",
    "Compliance": "teal"
  };
  
  return map[category] || "gray";
}

// Test Cases for getCategoryColor:
// 1. "AI Security" -> "purple"
// 2. "Risk" -> "orange"
// 3. "Unknown" -> "gray"

/**
 * Extracts formatted content from the body up to the paragraph at endIndex.
 * Handles Headings, Paragraphs, and ListItems (Bullets/Numbered).
 *
 * @param {GoogleAppsScript.Document.Body} body - The document body.
 * @param {number} endIndex - The index of the paragraph (in getParagraphs array) to stop before.
 * @return {string} The formatted HTML content.
 */
function extractFormattedContent(body, endIndex) {
  var html = [];
  var listState = { active: false, type: null };
  var numChildren = body.getNumChildren();
  var paragraphCount = 0;

  for (var i = 0; i < numChildren; i++) {
    var child = body.getChild(i);
    var type = child.getType();
    
    // Check if we reached the limit (only counts PARAGRAPH elements to match endIndex)
    if (type === DocumentApp.ElementType.PARAGRAPH) {
      if (paragraphCount === endIndex) break;
      paragraphCount++;
    }

    var text = "";
    var heading = DocumentApp.ParagraphHeading.NORMAL;
    var attrs = {};
    var isListItem = false;
    var glyphType = null;

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      var p = child.asParagraph();
      text = p.getText();
      heading = p.getHeading();
      attrs = p.getAttributes();
    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      var l = child.asListItem();
      text = l.getText();
      attrs = l.getAttributes();
      isListItem = true;
      glyphType = l.getGlyphType();
    } else {
      continue; // Skip tables, images, etc.
    }

    // Skip empty lines but allow them to break lists
    if (!text.trim()) {
      if (listState.active) {
        html.push('</' + listState.type + '>');
        listState.active = false;
        listState.type = null;
      }
      continue;
    }

    text = fixEncoding(text.trim());
    
    // Formatting
    var isBold = attrs[DocumentApp.Attribute.BOLD] === true;
    var isItalic = attrs[DocumentApp.Attribute.ITALIC] === true;
    
    var content = text;
    if (isBold) content = '<strong>' + content + '</strong>';
    if (isItalic) content = '<em>' + content + '</em>';

    if (isListItem) {
      var isUl = glyphType === DocumentApp.GlyphType.BULLET || 
                 glyphType === DocumentApp.GlyphType.HOLLOW_BULLET || 
                 glyphType === DocumentApp.GlyphType.SQUARE_BULLET;
      var currentListType = isUl ? 'ul' : 'ol';

      if (!listState.active) {
        html.push('<' + currentListType + '>');
        listState.active = true;
        listState.type = currentListType;
      } else if (listState.type !== currentListType) {
        // Close old list, start new
        html.push('</' + listState.type + '>');
        html.push('<' + currentListType + '>');
        listState.type = currentListType;
      }
      html.push('<li>' + content + '</li>');
    } else {
      // Close list if open
      if (listState.active) {
        html.push('</' + listState.type + '>');
        listState.active = false;
        listState.type = null;
      }

      var tag = 'p';
      if (heading === DocumentApp.ParagraphHeading.HEADING1) tag = 'h1';
      else if (heading === DocumentApp.ParagraphHeading.HEADING2) tag = 'h2';
      else if (heading === DocumentApp.ParagraphHeading.HEADING3) tag = 'h3';
      
      html.push('<' + tag + '>' + content + '</' + tag + '>');
    }
  }

  if (listState.active) {
    html.push('</' + listState.type + '>');
  }

  return html.join('\n');
}

/**
 * Generates the complete HTML for a blog article.
 *
 * @param {Object} data - The article data object.
 * @return {string} The complete HTML document.
 */
function generateArticleHTML(data) {
  var badgesHTML = "";
  if (data.categories && data.categories.length > 0) {
    badgesHTML = data.categories.map(function(cat) {
      var color = getCategoryColor(cat);
      return '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-' + color + '-500/20 text-' + color + '-300 border border-' + color + '-500/30">' + cat.toUpperCase() + '</span>';
    }).join(' ');
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8"/>
    <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
    <meta name="description" content="${data.excerpt}"/>
    <title>${data.title} - AtlasSecurity</title>
    <link href="https://fonts.googleapis.com" rel="preconnect"/>
    <link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&amp;family=Plus+Jakarta+Sans:wght@400;600;700;800&amp;display=swap" rel="stylesheet"/>
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
    <script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
    <style>
        body {
            background-color: #020617;
            background-image: radial-gradient(at 0% 0%, rgba(49, 46, 129, 0.4) 0px, transparent 50%),
                            radial-gradient(at 100% 0%, rgba(79, 70, 229, 0.15) 0px, transparent 50%);
            background-attachment: fixed;
            color: #f8fafc;
            font-family: 'Inter', sans-serif;
        }
        .font-display { font-family: 'Plus Jakarta Sans', sans-serif; }
        .glass-content {
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(12px);
            border-radius: 1rem;
            padding: 2.5rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.6);
            max-width: 800px;
            margin: 2rem auto;
        }
        .glass-content h1, .glass-content h2, .glass-content h3, 
        .glass-content h4, .glass-content h5, .glass-content h6 {
            color: #1a1a1a;
            font-family: 'Plus Jakarta Sans', sans-serif;
            font-weight: 700;
            margin-top: 1.5em;
            margin-bottom: 0.5em;
        }
        .glass-content p, .glass-content li {
            color: #1a1a1a;
            line-height: 1.7;
            margin-bottom: 1em;
        }
        .glass-content strong { color: #000000; font-weight: 700; }
        .glass-content a { color: #2563eb; text-decoration: underline; }
        .glass-nav {
            background: rgba(2, 6, 23, 0.8);
            backdrop-filter: blur(12px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
    </style>
</head>
<body>
    <!-- Navigation -->
    <nav class="fixed top-0 w-full z-50 glass-nav transition-all duration-300">
        <div class="flex items-center justify-center px-5 py-4">
            <a href="../index.html" class="flex items-center gap-2">
                <span class="material-symbols-outlined text-indigo-500" style="font-size: 32px;">security</span>
                <h1 class="text-2xl font-display font-bold tracking-tight text-white">Atlas<span class="text-indigo-500">SECURITY</span></h1>
            </a>
        </div>
    </nav>

    <main class="relative z-10 pt-32 pb-24 px-4">
        <!-- Article Header -->
        <header class="max-w-4xl mx-auto text-center mb-12">
            <div class="flex flex-wrap justify-center gap-2 mb-6">
                ${badgesHTML}
            </div>
            <h1 class="text-4xl md:text-5xl font-display font-bold text-white mb-6 leading-tight">${data.title}</h1>
            <div class="flex items-center justify-center gap-4 text-slate-400 text-sm font-medium">
                <span>${data.dateDisplay}</span>
            </div>
        </header>

        <!-- Article Content -->
        <article class="glass-content">
            ${data.content}
        </article>

        <!-- Footer / Back Link -->
        <div class="max-w-4xl mx-auto mt-12 text-center">
            <a href="../insights.html" class="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors font-medium">
                <span class="material-symbols-outlined">arrow_back</span>
                Back to Insights
            </a>
        </div>
    </main>
</body>
</html>`;
}

/**
 * Generates the HTML card for the insights page.
 *
 * @param {Object} article - The article object.
 * @return {string} The HTML card.
 */
function generateCardHTML(article) {
  var primaryCategory = (article.categories && article.categories.length > 0) 
    ? article.categories[0].toLowerCase().replace(/\s+/g, '-') 
    : "article";

  var badgesHTML = "";
  if (article.categories && article.categories.length > 0) {
    badgesHTML = article.categories.map(function(cat) {
      var color = getCategoryColor(cat);
      return '<span class="px-3 py-1 rounded-full text-xs font-semibold tracking-wider bg-' + color + '-500/20 text-' + color + '-300 border border-' + color + '-500/30">' + cat.toUpperCase() + '</span>';
    }).join(' ');
  }

  return `
    <article class="bg-slate-900/90 backdrop-blur-md border border-indigo-500/20 shadow-2xl rounded-2xl relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300" data-category="${primaryCategory}">
      <a href="articles/${article.slug}.html" class="block p-6 md:p-8 h-full">
        <div class="flex items-center gap-3 mb-4 flex-wrap">
          ${badgesHTML}
          <span class="px-3 py-1 rounded-full text-xs font-semibold tracking-wider bg-slate-700 text-slate-300 border border-slate-600">${article.dateDisplay}</span>
          <span class="text-slate-400 text-xs">•</span>
          <span class="text-slate-400 text-xs">${article.readTime}</span>
        </div>
        
        <h3 class="text-xl md:text-2xl font-bold text-white mb-3 group-hover:text-blue-300 transition-colors line-clamp-2">
          ${article.title}
        </h3>
        
        <p class="text-slate-300 text-sm leading-relaxed mb-6 line-clamp-3">
          ${article.excerpt}
        </p>
        
        <div class="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition-all group/link group-hover/link:gap-3">
          READ FULL INSIGHT
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
        </div>
      </a>
    </article>`;
}

/**
 * Fetches a file from GitHub via the REST API.
 *
 * @param {string} path - The file path in the repository.
 * @param {Object} settings - Object containing token, repo, and branch.
 * @return {Object|null} Object with decoded content and SHA, or null if not found.
 */
function getGitHubFile(path, settings) {
  var url = "https://api.github.com/repos/" + settings.repo + "/contents/" + path + "?ref=" + settings.branch;
  var options = {
    method: "get",
    headers: {
      "Authorization": "token " + settings.token,
      "Accept": "application/vnd.github.v3+json"
    },
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();

    if (code === 200) {
      var data = JSON.parse(response.getContentText());
      var decoded = Utilities.newBlob(Utilities.base64Decode(data.content)).getDataAsString();
      return { content: decoded, sha: data.sha };
    } else if (code === 404) {
      return null;
    } else {
      Logger.log("GitHub API Error (" + code + "): " + response.getContentText());
      throw new Error("Failed to fetch file from GitHub: " + code);
    }
  } catch (e) {
    Logger.log("Error in getGitHubFile: " + e.toString());
    throw e;
  }
}

/**
 * Creates or updates a file in the GitHub repository.
 *
 * @param {string} path - The file path.
 * @param {string} content - The content to save.
 * @param {string} message - The commit message.
 * @param {Object} settings - Object containing token, repo, and branch.
 * @return {Object} Object containing success status and the file URL.
 */
function createOrUpdateGitHubFile(path, content, message, settings) {
  // Check if file exists to get SHA for update
  var existingFile = getGitHubFile(path, settings);
  var sha = existingFile ? existingFile.sha : null;

  var url = "https://api.github.com/repos/" + settings.repo + "/contents/" + path;
  var payload = {
    message: message,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: settings.branch
  };

  if (sha) {
    payload.sha = sha;
  }

  var options = {
    method: "put",
    headers: {
      "Authorization": "token " + settings.token,
      "Accept": "application/vnd.github.v3+json"
    },
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();

  if (code === 200 || code === 201) {
    var data = JSON.parse(response.getContentText());
    return { success: true, url: data.content.html_url };
  } else {
    Logger.log("GitHub Save Error (" + code + "): " + response.getContentText());
    throw new Error("Failed to save file to GitHub: " + code);
  }
}

/**
 * Updates the insights.html file by injecting a new article card.
 *
 * @param {string} newCardHtml - The HTML for the new card.
 * @param {Object} settings - Object containing token, repo, and branch.
 * @return {boolean} True if successful.
 */
function updateInsightsHtml(newCardHtml, settings) {
  var fileName = "insights.html";
  var fileData = getGitHubFile(fileName, settings);

  if (!fileData) {
    throw new Error("insights.html not found in the repository.");
  }

  var html = fileData.content;
  
  // Find insertion point
  var insertionMarker = "<!-- NEW ARTICLES -->";
  var index = html.indexOf(insertionMarker);

  if (index !== -1) {
    // Insert after the marker
    index += insertionMarker.length;
  } else {
    // Fallback: Insert before the first <article> tag
    index = html.indexOf("<article");
  }

  if (index === -1) {
    throw new Error("Could not find insertion point (<!-- NEW ARTICLES --> or <article>) in insights.html");
  }

  // Insert the new card
  var newContent = html.slice(0, index) + "\n\n    " + newCardHtml + html.slice(index);

  var result = createOrUpdateGitHubFile(fileName, newContent, "Update insights.html with new article", settings);
  return result.success;
}

// ==========================================
// MENU & SETTINGS
// ==========================================

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Blog Publisher')
    .addItem('Publish Article', 'publishFullArticle')
    .addSeparator()
    .addItem('GitHub Settings', 'showSetupDialog')
    .addToUi();
}

function showSetupDialog() {
  var ui = DocumentApp.getUi();
  var props = PropertiesService.getUserProperties();
  
  var token = props.getProperty('GITHUB_TOKEN') || '';
  var repo = props.getProperty('GITHUB_REPO') || '';
  var branch = props.getProperty('GITHUB_BRANCH') || 'main';
  
  var result = ui.prompt(
    'GitHub Configuration',
    'Enter format: TOKEN|REPO|BRANCH\nExample: ghp_xyz|username/repo|main\n\nCurrent: ' + repo,
    ui.ButtonSet.OK_CANCEL
  );
  
  if (result.getSelectedButton() == ui.Button.OK) {
    var input = result.getResponseText().split('|');
    if (input.length === 3) {
      props.setProperties({
        'GITHUB_TOKEN': input[0].trim(),
        'GITHUB_REPO': input[1].trim(),
        'GITHUB_BRANCH': input[2].trim()
      });
      ui.alert('Settings saved successfully.');
    } else {
      ui.alert('Invalid format. Please use: TOKEN|REPO|BRANCH');
    }
  }
}

// ==========================================
// MAIN PUBLISH LOGIC
// ==========================================

function publishFullArticle() {
  var ui = DocumentApp.getUi();
  var props = PropertiesService.getUserProperties();
  var settings = {
    token: props.getProperty('GITHUB_TOKEN'),
    repo: props.getProperty('GITHUB_REPO'),
    branch: props.getProperty('GITHUB_BRANCH')
  };

  // 1. Validate Settings
  if (!settings.token || !settings.repo || !settings.branch) {
    ui.alert('GitHub settings not found. Please run "GitHub Settings" from the menu.');
    showSetupDialog();
    return;
  }

  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();

  // 2. Extract Date (From End)
  var dateInfo = extractDateFromEnd(body);
  if (!dateInfo) {
    ui.alert('Error: No valid date found at the end of the document.\nFormat required: "Month DD, YYYY" (e.g., February 13, 2026)');
    return;
  }

  // 3. Extract Formatted Content
  var contentHtml = extractFormattedContent(body, dateInfo.index);
  
  // 4. Extract Title & Excerpt
  var paragraphs = body.getParagraphs();
  var title = "";
  var excerpt = "";
  var titleFoundIndex = -1;

  // Find Title
  for (var i = 0; i < dateInfo.index; i++) {
    var p = paragraphs[i];
    var text = p.getText().trim();
    if (text.length > 0) {
      if (p.getHeading() === DocumentApp.ParagraphHeading.HEADING1 || p.getHeading() === DocumentApp.ParagraphHeading.TITLE) {
        title = text;
        titleFoundIndex = i;
        break;
      }
      if (!title) {
        title = text;
        titleFoundIndex = i;
      }
    }
  }
  if (!title) title = doc.getName();
  title = fixEncoding(title);

  // Generate Excerpt
  var rawTextForReadTime = "";
  var excerptLength = 0;
  for (var i = 0; i < dateInfo.index; i++) {
    var p = paragraphs[i];
    var text = p.getText().trim();
    rawTextForReadTime += text + " ";
    
    if (i > titleFoundIndex && excerptLength < 150 && text.length > 0) {
      excerpt += text + " ";
      excerptLength += text.length;
    }
  }
  excerpt = fixEncoding(excerpt).substring(0, 160).trim();
  if (excerpt.length > 0) excerpt += "...";

  // 5. Metadata
  var slug = generateSlug(title);
  var readTime = calculateReadTime(rawTextForReadTime);

  // 6. Category Selection
  var catResponse = ui.prompt('Article Categories', 'Enter categories separated by comma (e.g., Cloud Security, Risk):\n(Primary category first)', ui.ButtonSet.OK_CANCEL);
  if (catResponse.getSelectedButton() !== ui.Button.OK) return;
  
  var categories = catResponse.getResponseText().split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
  if (categories.length === 0) categories = ["General"];

  // 7. Generate & Upload
  try {
    var fullArticleHtml = generateArticleHTML({ title: title, slug: slug, dateRaw: dateInfo.raw, dateDisplay: dateInfo.display, categories: categories, content: contentHtml, excerpt: excerpt });
    var cardHtml = generateCardHTML({ title: title, slug: slug, dateDisplay: dateInfo.display, excerpt: excerpt, categories: categories, readTime: readTime });

    var uploadResult = createOrUpdateGitHubFile("articles/" + slug + ".html", fullArticleHtml, "Publish: " + title, settings);
    updateInsightsHtml(cardHtml, settings);
    
    ui.alert('Published Successfully!\n\nArticle URL: ' + uploadResult.url);
  } catch (e) {
    Logger.log(e);
    ui.alert('Error publishing to GitHub:\n' + e.message);
  }
}

function calculateReadTime(text) {
  if (!text) return "1 MIN READ";
  var wordCount = text.trim().split(/\s+/).length;
  var minutes = Math.ceil(wordCount / 200);
  return minutes + " MIN READ";
}
/**
 * Google Apps Script Blog Publisher
 