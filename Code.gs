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
function extractFormattedContent(body, endIndex, startIndex) {
  var html = [];
  var inList = false;
  var listType = null; // 'ul' or 'ol'
  
  var paragraphs = body.getParagraphs();
  
  for (var i = startIndex || 0; i < endIndex && i < paragraphs.length; i++) {
    var p = paragraphs[i];
    
    var text = p.getText();
    var trimmedText = text.trim();
    
    if (!trimmedText) {
      // Close any open list
      if (inList) {
        html.push('</' + listType + '>');
        inList = false;
        listType = null;
      }
      html.push('<p>&nbsp;</p>');
      continue;
    }
    
    // Check for bullet or numbered list
    // Debug logging to diagnose bullet detection issues
    if (trimmedText.length > 0) {
      Logger.log("Analyzing paragraph: '" + trimmedText + "'");
      Logger.log("First char code: " + trimmedText.charCodeAt(0));
      var isMatch = /^([\u2022\u25E6\u25AA\u25CF\-*])\s*(.+)/.test(trimmedText);
      Logger.log("Bullet Regex Match: " + isMatch);
    }
    var bulletMatch = trimmedText.match(/^([\u2022\u25E6\u25AA\u25CF\-*])\s*(.+)/);
    var numberMatch = trimmedText.match(/^(\d+[\.\)])\s*(.+)/);
    
    if (bulletMatch) {
      // It's a bullet point
      if (!inList || listType !== 'ul') {
        if (inList) html.push('</' + listType + '>');
        html.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      var contentStr = bulletMatch[2];
      var startIdx = text.lastIndexOf(contentStr);
      var content = getFormattedText(p, startIdx);
      html.push('<li>' + content + '</li>');
      
    } else if (numberMatch) {
      // It's a numbered item
      if (!inList || listType !== 'ol') {
        if (inList) html.push('</' + listType + '>');
        html.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      var contentStr = numberMatch[2];
      var startIdx = text.lastIndexOf(contentStr);
      var content = getFormattedText(p, startIdx);
      html.push('<li>' + content + '</li>');
      
    } else {
      // Regular paragraph
      if (inList) {
        html.push('</' + listType + '>');
        inList = false;
        listType = null;
      }
      
      var tag = 'p';
      var heading = p.getHeading();
      
      if (heading === DocumentApp.ParagraphHeading.HEADING1 || heading === DocumentApp.ParagraphHeading.TITLE) {
        tag = 'h1';
      }
      else if (heading === DocumentApp.ParagraphHeading.HEADING2) tag = 'h2';
      else if (heading === DocumentApp.ParagraphHeading.HEADING3) tag = 'h3';
      
      html.push('<' + tag + '>' + getFormattedText(p) + '</' + tag + '>');
    }
  }
  
  // Close any remaining list
  if (inList) {
    html.push('</' + listType + '>');
  }
  
  return html.join('\n');
}

function getFormattedText(paragraph, startOffset) {
  var text = paragraph.getText();
  if (!text) return "";
  
  var textObj = paragraph.editAsText();
  var startIndex = startOffset || 0;
  var result = "";
  var inBold = false;
  var inItalic = false;
  
  for (var i = startIndex; i < text.length; i++) {
    var attrs = textObj.getAttributes(i);
    var char = text[i];
    
    var isBold = attrs[DocumentApp.Attribute.BOLD] === true;
    var isItalic = attrs[DocumentApp.Attribute.ITALIC] === true;
    
    // Handle bold transitions
    if (isBold && !inBold) {
      result += '<strong>';
      inBold = true;
    } else if (!isBold && inBold) {
      result += '</strong>';
      inBold = false;
    }
    
    // Handle italic transitions
    if (isItalic && !inItalic) {
      result += '<em>';
      inItalic = true;
    } else if (!isItalic && inItalic) {
      result += '</em>';
      inItalic = false;
    }
    
    result += char;
  }
  
  // Close any open tags
  if (inBold) result += '</strong>';
  if (inItalic) result += '</em>';
  
  return fixEncoding(result);
}

/**
 * Generates the complete HTML for a blog article.
 *
 * @param {Object} data - The article data object.
 * @return {string} The complete HTML document.
 */
function generateArticleHTML(data) {
  // Build category badges
  var badgesHTML = "";
  if (data.categories && data.categories.length > 0) {
    badgesHTML = data.categories.map(function(cat) {
      var color = getCategoryColor(cat);
      return '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-' + color + '-500/20 text-' + color + '-300 border border-' + color + '-500/30">' + cat.toUpperCase() + '</span>';
    }).join(' ');
  }

  // Return complete HTML using string concatenation (avoid template literal issues)
  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>' + data.title + ' - AtlasSecurity</title>' +
      '<script src="https://cdn.tailwindcss.com"></script>' +
      '<link href="https://fonts.googleapis.com/css2?family=Inter&family=Plus+Jakarta+Sans&family=Material+Symbols+Outlined" rel="stylesheet">' +
      '<style>' +
        'body { background-color: #020617; color: #f8fafc; font-family: "Inter", sans-serif; }' +
        '.glass-content { background: rgba(255,255,255,0.9); backdrop-filter: blur(12px); border-radius: 1rem; padding: 2.5rem; box-shadow: 0 8px 32px rgba(0,0,0,0.15); border: 1px solid rgba(255,255,255,0.6); max-width: 800px; margin: 2rem auto; }' +
        '.glass-content h1, .glass-content h2, .glass-content h3, .glass-content p, .glass-content li { color: #1a1a1a !important; }' +
        '.glass-content strong { font-weight: 700; }' +
        '.glass-content ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1rem; }' +
        '.glass-content ol { list-style-type: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }' +
        '.glass-content li { margin-bottom: 0.5rem; }' +
        '.glass-content p { margin-bottom: 1.25rem; line-height: 1.7; }' +
        '.video-bg { position: fixed; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; }' +
        '.video-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(2,6,23,0.6); z-index: -1; }' +
      '</style>' +
    '</head>' +
    '<body class="text-slate-100 min-h-screen font-sans">' +
      '<!-- Video Background -->' +
      '<video autoplay muted loop playsinline class="video-bg">' +
        '<source src="../images/newvid.mp4" type="video/mp4">' +
      '</video>' +
      '<div class="video-overlay"></div>' +
      
      '<!-- Fixed Header -->' +
      '<nav class="fixed top-0 w-full z-50 bg-slate-900/80 backdrop-blur-md border-b border-white/10">' +
        '<div class="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">' +
          '<a href="../index.html" class="flex items-center gap-2">' +
            '<span class="material-symbols-outlined text-indigo-500 text-3xl">security</span>' +
            '<span class="text-2xl font-bold text-white">Atlas<span class="text-indigo-500">SECURITY</span></span>' +
          '</a>' +
          '<div class="flex items-center gap-6">' +
            '<a href="../index.html" class="text-slate-300 hover:text-white transition">Home</a>' +
            '<a href="../about.html" class="text-slate-300 hover:text-white transition">About</a>' +
            '<a href="../insights.html" class="text-slate-300 hover:text-white transition">Insights</a>' +
          '</div>' +
        '</div>' +
      '</nav>' +
      
      '<!-- Main Content -->' +
      '<main class="relative z-10 pt-24 pb-32 px-4">' +
        '<header class="max-w-4xl mx-auto text-center mb-12 pt-8">' +
          '<div class="flex flex-wrap justify-center gap-2 mb-6">' + badgesHTML + '</div>' +
          '<h1 class="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">' + data.title + '</h1>' +
          '<p class="text-slate-400">' + data.dateDisplay + '</p>' +
        '</header>' +
        
        '<article class="glass-content">' +
          data.content +
          '<div style="text-align: right; margin-top: 32px; color: #64748b;">' + data.dateDisplay + '</div>' +
        '</article>' +
        
        '<div class="max-w-4xl mx-auto mt-12 text-center">' +
          '<a href="../insights.html" class="inline-flex items-center gap-2 text-slate-400 hover:text-white transition">' +
            '<span class="material-symbols-outlined">arrow_back</span>' +
            'Back to all Insights' +
          '</a>' +
        '</div>' +
      '</main>' +
      
      '<!-- Fixed Footer -->' +
      '<footer class="fixed bottom-0 w-full z-50 bg-slate-900/90 backdrop-blur-md border-t border-white/10">' +
        '<div class="flex justify-around items-center py-3 max-w-md mx-auto">' +
          '<a href="../index.html" class="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition">' +
            '<span class="material-symbols-outlined text-xl">home</span>' +
            '<span class="text-xs">Home</span>' +
          '</a>' +
          '<a href="../about.html" class="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition">' +
            '<span class="material-symbols-outlined text-xl">info</span>' +
            '<span class="text-xs">About</span>' +
          '</a>' +
          '<a href="../insights.html" class="flex flex-col items-center gap-1 text-indigo-400 transition">' +
            '<span class="material-symbols-outlined text-xl">article</span>' +
            '<span class="text-xs">Tech Insights</span>' +
          '</a>' +
        '</div>' +
      '</footer>' +
    '</body>' +
    '</html>';
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

  // 3. Extract Formatted Content
  var startIndex = titleFoundIndex + 1;
  var contentHtml = extractFormattedContent(body, dateInfo.index, startIndex);

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
    updateSitemap(slug, settings);
    
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
 * Updates the sitemap.xml file with the new article URL.
 *
 * @param {string} slug - The article slug.
 * @param {Object} settings - Object containing token, repo, and branch.
 */
function updateSitemap(slug, settings) {
  var fileName = "sitemap.xml";
  var fileData = getGitHubFile(fileName, settings);
  var sitemapContent = "";
  var today = new Date().toISOString().split('T')[0];
  var articleUrl = "https://hashp.github.io/gitAtlas/articles/" + slug + ".html"; // Adjust base URL as needed

  if (fileData) {
    sitemapContent = fileData.content;
    // Check if URL already exists
    if (sitemapContent.indexOf(articleUrl) === -1) {
      // Insert new url entry before </urlset>
      var newEntry = "  <url>\n    <loc>" + articleUrl + "</loc>\n    <lastmod>" + today + "</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n";
      sitemapContent = sitemapContent.replace("</urlset>", newEntry + "</urlset>");
    } else {
      // Update lastmod if URL exists
      var regex = new RegExp("<loc>" + articleUrl.replace(/\//g, "\\/") + "<\\/loc>\\s*<lastmod>.*?<\\/lastmod>", "s");
      var updatedEntry = "<loc>" + articleUrl + "</loc>\n    <lastmod>" + today + "</lastmod>";
      sitemapContent = sitemapContent.replace(regex, updatedEntry);
    }
  } else {
    // Create new sitemap
    sitemapContent = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      '  <url>\n' +
      '    <loc>https://hashp.github.io/gitAtlas/index.html</loc>\n' +
      '    <lastmod>' + today + '</lastmod>\n' +
      '    <changefreq>daily</changefreq>\n' +
      '    <priority>1.0</priority>\n' +
      '  </url>\n' +
      '  <url>\n' +
      '    <loc>' + articleUrl + '</loc>\n' +
      '    <lastmod>' + today + '</lastmod>\n' +
      '    <changefreq>monthly</changefreq>\n' +
      '    <priority>0.8</priority>\n' +
      '  </url>\n' +
      '</urlset>';
  }

  createOrUpdateGitHubFile(fileName, sitemapContent, "Update sitemap.xml", settings);
}