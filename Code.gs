// ==========================================
// SITE CONFIGURATION
// ==========================================
var BASE_URL = "https://atlassecurityai.github.io/AtlasSecurity";

/**
 * Extracts the publication date from the end of the document.
 */
function extractDateFromEnd(body) {
  var paragraphs = body.getParagraphs();
  var datePattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}$/i;
  
  for (var i = paragraphs.length - 1; i >= 0; i--) {
    var text = paragraphs[i].getText().trim();
    if (text.length > 0) {
      if (datePattern.test(text)) {
        var date = new Date(text);
        var iso = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
        var display = Utilities.formatDate(date, Session.getScriptTimeZone(), "MMM dd, yyyy").toUpperCase();
        return { raw: text, iso: iso, display: display, index: i };
      } else {
        return null;
      }
    }
  }
  return null;
}

/**
 * Fixes encoding issues.
 */
function fixEncoding(text) {
  if (!text) return "";
  text = text.replace(/([a-zA-Z])\?([a-zA-Z])/g, "$1'$2");
  text = text.replace(/(^|\s)\?([a-zA-Z])/g, "$1'$2");
  return text;
}

/**
 * Generates a URL-friendly slug. Keeps numbers in title.
 */
function generateSlug(title) {
  if (!title) return "";
  return title.toString().toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Maps category to color.
 */
function getCategoryColor(category) {
  var map = {
    "AI Security": "indigo",
    "Cloud Security": "sky",
    "Governance": "emerald",
    "Risk": "rose",
    "Compliance": "amber",
    "General": "blue"
  };
  return map[category] || "blue";
}

/**
 * Calculates read time.
 */
function calculateReadTime(text) {
  if (!text) return "1 MIN READ";
  var wordCount = text.trim().split(/\s+/).length;
  var minutes = Math.ceil(wordCount / 200);
  return minutes + " MIN READ";
}

/**
 * CRITICAL FIX: Extracts content with PROPER list detection.
 * This version uses multiple detection methods to ensure lists are caught.
 */
function extractFormattedContent(body, endIndex, startIndex) {
  var htmlOutput = [];
  var paragraphs = body.getParagraphs();
  var start = startIndex || 0;
  var end = endIndex || paragraphs.length;
  
  var inList = false;
  var currentListType = null;
  var previousText = "";
  
  Logger.log("=== extractFormattedContent START ===");
  Logger.log("Paragraphs: " + paragraphs.length + ", Start: " + start + ", End: " + end);
  
  for (var i = start; i < end && i < paragraphs.length; i++) {
    var p = paragraphs[i];
    var text = p.getText();
    var trimmed = text.trim();
    
    // Skip empty paragraphs
    if (!trimmed) {
      // Don't close list on empty paragraphs to allow spacing between items
      continue;
    }
    
    // DETECT LIST TYPE
    var isListItem = false;
    var isBullet = false;
    var detectedListType = 'ul';
    var isNative = false;
    
    // METHOD 1: NATIVE LIST
    try {
      if (p.getType() === DocumentApp.ElementType.LIST_ITEM) {
        isListItem = true;
        isNative = true;
        var glyph = p.asListItem().getGlyphType();
        if (glyph === DocumentApp.GlyphType.NUMBER) {
          detectedListType = 'ol';
        }
        Logger.log("Para " + i + ": NATIVE LIST");
      }
    } catch (e) {
      // Not a native list item
    }
    
    // METHOD 2: VISUAL BULLET
    if (!isListItem) {
      var bulletMatch = trimmed.match(/^(\s*)[•\-–—]\s+/);
      var numberMatch = trimmed.match(/^(\s*)\d+[\.\)]\s+/);
      
      if (bulletMatch) {
        isListItem = true;
        isBullet = true;
        detectedListType = 'ul';
        Logger.log("Para " + i + ": TEXT BULLET DETECTED");
      } else if (numberMatch) {
        isListItem = true;
        isBullet = false;
        detectedListType = 'ol';
        Logger.log("Para " + i + ": TEXT NUMBER DETECTED");
      }
    }
    
    // METHOD 3: COLON TRIGGER (Ghost List)
    if (!isListItem) {
      if (isGhostListItem(text, previousText, p.getHeading())) {
        isListItem = true;
        isBullet = true;
        detectedListType = 'ul';
        Logger.log("Para " + i + ": GHOST LIST DETECTED (Colon Trigger)");
      }
    }
    
    // METHOD 4: NUMBERED HEADING VETO
    if (isListItem && !isNative) {
      if (/^\d+\.\s+\w/.test(trimmed)) {
        isListItem = false;
        Logger.log("Para " + i + ": VETOED (Numbered Heading)");
      }
    }
    
    // PROCESS LIST ITEM
    if (isListItem) {
      // Start new list if not in one
      if (!inList) {
        htmlOutput.push('<' + detectedListType + ' class="list-disc pl-5 space-y-2 mb-4">');
        inList = true;
        currentListType = detectedListType;
      }
      
      // Handle mixed list types (switch from ul to ol or vice versa)
      else if (currentListType !== detectedListType) {
        htmlOutput.push('</' + currentListType + '>');
        htmlOutput.push('<' + detectedListType + ' class="list-disc pl-5 space-y-2 mb-4">');
        currentListType = detectedListType;
      }
      
      // Calculate offset to strip bullet/number from formatted text
      var contentOffset = 0;
      if (!isNative) {
        var match = text.match(/^(\s*)([•\-–—]|\d+[\.\)])\s+/);
        if (match) {
          contentOffset = match[0].length;
        }
      }
      
      htmlOutput.push('<li class="text-slate-300 leading-relaxed">' + processFormattedText(p, contentOffset) + '</li>');
    }
    
    // NOT A LIST ITEM - close any open list and process as regular paragraph
    else {
      if (inList) {
        htmlOutput.push('</' + currentListType + '>');
        inList = false;
        currentListType = null;
      }
      
      // Determine element type based on heading
      var heading = p.getHeading();
      var tag = 'p';
      var classes = 'text-slate-300 leading-relaxed mb-4';
      
      if (heading === DocumentApp.ParagraphHeading.HEADING1 || heading === DocumentApp.ParagraphHeading.TITLE) {
        tag = 'h1';
        classes = 'text-3xl md:text-4xl font-bold text-white mb-4 leading-tight';
      } else if (heading === DocumentApp.ParagraphHeading.HEADING2) {
        tag = 'h2';
        classes = 'text-2xl md:text-3xl font-bold text-white mt-8 mb-4 leading-tight';
      } else if (heading === DocumentApp.ParagraphHeading.HEADING3) {
        tag = 'h3';
        classes = 'text-xl md:text-2xl font-bold text-white mt-6 mb-3 leading-tight';
      } else if (heading === DocumentApp.ParagraphHeading.HEADING4) {
        tag = 'h4';
        classes = 'text-lg md:text-xl font-bold text-white mt-4 mb-2';
      }
      
      // Check if text looks like a heading but isn't marked as one
      // (e.g., "2. Bias Amplification" - number + text)
      if (tag === 'p' && /^\d+\.\s+\w/.test(trimmed)) {
        tag = 'h3';
        classes = 'text-xl md:text-2xl font-bold text-white mt-6 mb-3 leading-tight';
        Logger.log("Para " + i + ": PROMOTED to h3 (looks like numbered heading)");
      }
      
      // FIXED: Removed duplicate push. Only using processFormattedText to ensure formatting is preserved.
      htmlOutput.push('<' + tag + ' class="' + classes + '">' + processFormattedText(p) + '</' + tag + '>');
    }
    
    // Update previous text for next iteration context
    previousText = trimmed;
  }
  
  // Close any remaining list
  if (inList) {
    htmlOutput.push('</' + currentListType + '>');
  }
  
  Logger.log("=== extractFormattedContent END ===");
  return htmlOutput.join('\n');
}

/**
 * Generates article HTML matching index.html structure.
 */
function generateArticleHTML(data) {
  var badgesHTML = "";
  if (data.categories && data.categories.length > 0) {
    badgesHTML = data.categories.map(function(cat) {
      var color = getCategoryColor(cat);
      return '<span class="px-3 py-1 rounded-full text-xs font-semibold bg-' + color + '-500/20 text-' + color + '-300 border border-' + color + '-500/30">' + cat.toUpperCase() + '</span>';
    }).join(' ');
  }
  
  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + data.title + ' - AtlasSECURITY</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">' +
    '<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">' +
    '<script src="https://cdn.tailwindcss.com"></script>' +
    '<link rel="stylesheet" href="../style.css">' +
    '<script>' +
    'tailwind.config = {' +
    'theme: { extend: { colors: { primary: "#0052cc", "primary-dark": "#003d99", "accent-blue": "#2563eb", background: "#0f172a", "background-light": "#1e293b", "surface-light": "#f8fafc", "text-main": "#0f172a", "text-muted": "#64748b" }, fontFamily: { display: ["Space Grotesk", "sans-serif"], body: ["Noto Sans", "sans-serif"] } } }' +
    '}' +
    '</script>' +
    '<style>' +
    '.glass-panel { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }' +
    '.hero-gradient { background: linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(15, 23, 42, 0.8) 100%); }' +
    '</style>' +
    '</head>' +
    '<body class="bg-background text-white font-body antialiased overflow-x-hidden">' +
    '<div class="fixed inset-0 w-full h-full overflow-hidden -z-10">' +
    '<video autoplay muted loop playsinline class="w-full h-full object-cover opacity-30">' +
    '<source src="../images/newvid.mp4" type="video/mp4">' +
    '</video>' +
    '<div class="absolute inset-0 bg-gradient-to-b from-background/80 via-background/90 to-background"></div>' +
    '</div>' +
    '<nav class="fixed top-0 w-full z-50 glass-panel border-b border-white/10">' +
    '<div class="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">' +
    '<a href="../index.html" class="flex items-center gap-2">' +
    '<span class="material-symbols-outlined text-primary text-3xl">security</span>' +
    '<h1 class="text-2xl font-bold font-display">' +
    '<span class="text-transparent bg-clip-text bg-gradient-to-r from-primary to-indigo-400">Atlas</span>' +
    '<span class="text-white">SECURITY</span>' +
    '</h1>' +
    '</a>' +
    '<div class="hidden md:flex items-center gap-6">' +
    '<a href="../index.html" class="text-slate-300 hover:text-white transition">Home</a>' +
    '<a href="../about.html" class="text-slate-300 hover:text-white transition">About</a>' +
    '<a href="../insights.html" class="text-slate-300 hover:text-white transition">Insights</a>' +
    '</div>' +
    '<button id="menuBtn" class="md:hidden text-white">' +
    '<span class="material-symbols-outlined text-2xl">menu</span>' +
    '</button>' +
    '</div>' +
    '<div id="mobileMenu" class="hidden md:hidden glass-panel border-t border-white/10">' +
    '<div class="px-6 py-4 space-y-3">' +
    '<a href="../index.html" class="block text-slate-300 hover:text-white transition">Home</a>' +
    '<a href="../about.html" class="block text-slate-300 hover:text-white transition">About</a>' +
    '<a href="../insights.html" class="block text-slate-300 hover:text-white transition">Insights</a>' +
    '</div>' +
    '</div>' +
    '</nav>' +
    '<main class="relative z-10 pt-24 pb-32 px-4">' +
    '<header class="max-w-4xl mx-auto text-center mb-12 pt-8">' +
    '<div class="flex flex-wrap justify-center gap-2 mb-6">' + badgesHTML + '</div>' +
    '<h1 class="text-3xl md:text-5xl font-bold font-display text-white mb-4 leading-tight">' + data.title + '</h1>' +
    '<p class="text-slate-400 text-sm uppercase tracking-wider">' + data.dateDisplay + '</p>' +
    '</header>' +
    '<article class="max-w-3xl mx-auto glass-panel rounded-2xl p-8 md:p-12 border border-white/10">' +
    '<div class="prose prose-invert prose-slate max-w-none">' +
    data.content +
    '</div>' +
    '<div class="mt-12 pt-8 border-t border-white/10 text-right">' +
    '<p class="text-slate-500 text-sm">Published: ' + data.dateDisplay + '</p>' +
    '</div>' +
    '</article>' +
    '<div class="max-w-3xl mx-auto mt-12 text-center">' +
    '<a href="../insights.html" class="inline-flex items-center gap-2 text-primary hover:text-white transition">' +
    '<span class="material-symbols-outlined">arrow_back</span>' +
    'Back to all Insights' +
    '</a>' +
    '</div>' +
    '</main>' +
    '<footer class="fixed bottom-0 w-full z-50 glass-panel border-t border-white/10">' +
    '<div class="flex justify-around items-center py-3 max-w-md mx-auto">' +
    '<a href="../index.html" class="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition">' +
    '<span class="material-symbols-outlined text-xl">home</span>' +
    '<span class="text-xs">Home</span>' +
    '</a>' +
    '<a href="../about.html" class="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition">' +
    '<span class="material-symbols-outlined text-xl">info</span>' +
    '<span class="text-xs">About</span>' +
    '</a>' +
    '<a href="../insights.html" class="flex flex-col items-center gap-1 text-primary transition">' +
    '<span class="material-symbols-outlined text-xl">article</span>' +
    '<span class="text-xs">Tech Insights</span>' +
    '</a>' +
    '</div>' +
    '</footer>' +
    '<script>' +
    'document.getElementById("menuBtn").addEventListener("click", function() {' +
    'document.getElementById("mobileMenu").classList.toggle("hidden");' +
    '});' +
    '</script>' +
    '</body>' +
    '</html>';
}

/**
 * Generates card HTML for insights page.
 */
function generateCardHTML(article) {
  var primaryCategory = (article.categories && article.categories.length > 0) 
    ? article.categories[0].toLowerCase().replace(/\s+/g, '-') 
    : 'article';
  
  var badgesHTML = "";
  if (article.categories && article.categories.length > 0) {
    badgesHTML = article.categories.map(function(cat) {
      var color = getCategoryColor(cat);
      return '<span class="px-3 py-1 rounded-full text-xs font-semibold tracking-wider bg-' + color + '-500/20 text-' + color + '-300 border border-' + color + '-500/30">' + cat.toUpperCase() + '</span>';
    }).join(' ');
  }
  
  return '<article class="bg-slate-900/80 backdrop-blur-md border border-indigo-500/20 shadow-2xl rounded-2xl relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300" data-category="' + primaryCategory + '">' +
    '<a href="articles/' + article.slug + '.html" class="block p-6 md:p-8 h-full">' +
    '<div class="flex items-center gap-3 mb-4 flex-wrap">' +
    badgesHTML +
    '<span class="px-3 py-1 rounded-full text-xs font-semibold tracking-wider bg-slate-700 text-slate-300 border border-slate-600">' + article.dateDisplay + '</span>' +
    '<span class="text-slate-400 text-xs">•</span>' +
    '<span class="text-slate-400 text-xs">' + article.readTime + '</span>' +
    '</div>' +
    '<h3 class="text-xl md:text-2xl font-bold text-white mb-3 group-hover:text-blue-300 transition-colors line-clamp-2">' +
    article.title +
    '</h3>' +
    '<p class="text-slate-300 text-sm leading-relaxed mb-6 line-clamp-3">' +
    article.excerpt +
    '</p>' +
    '<div class="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition-all group/link group-hover/link:gap-3">' +
    'READ FULL INSIGHT' +
    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>' +
    '</div>' +
    '</a>' +
    '</article>';
}

/**
 * GitHub API functions.
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
      throw new Error("Failed to fetch file from GitHub: " + code);
    }
  } catch (e) {
    Logger.log("Error in getGitHubFile: " + e.toString());
    throw e;
  }
}

function createOrUpdateGitHubFile(path, content, message, settings) {
  var existingFile = getGitHubFile(path, settings);
  var sha = existingFile ? existingFile.sha : null;
  
  var url = "https://api.github.com/repos/" + settings.repo + "/contents/" + path;
  var payload = {
    message: message,
    content: Utilities.base64Encode(content, Utilities.Charset.UTF_8),
    branch: settings.branch
  };
  if (sha) payload.sha = sha;
  
  var options = {
    method: "put",
    headers: {
      "Authorization": "token " + settings.token,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code === 200 || code === 201) {
    var data = JSON.parse(response.getContentText());
    return { success: true, url: data.content.html_url };
  } else {
    throw new Error("Failed to save file to GitHub: " + code);
  }
}

function updateInsightsHtml(newCardHtml, settings) {
  var fileName = "insights.html";
  var fileData = getGitHubFile(fileName, settings);
  if (!fileData) throw new Error("insights.html not found");
  
  var html = fileData.content;
  var insertionMarker = "<!-- NEW ARTICLES -->";
  var index = html.indexOf(insertionMarker);
  if (index !== -1) {
    index += insertionMarker.length;
  } else {
    index = html.indexOf("<article");
  }
  if (index === -1) throw new Error("Could not find insertion point");
  
  var newContent = html.slice(0, index) + "\n\n  " + newCardHtml + html.slice(index);
  var result = createOrUpdateGitHubFile(fileName, newContent, "Update insights.html with new article", settings);
  return result.success;
}

/**
 * Menu and main publish function.
 */
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
    'Enter format: TOKEN|REPO|BRANCH\nExample: ghp_xxx|username/repo|main\n\nCurrent: ' + repo,
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

function publishFullArticle() {
  var ui = DocumentApp.getUi();
  var props = PropertiesService.getUserProperties();
  var settings = {
    token: props.getProperty('GITHUB_TOKEN'),
    repo: props.getProperty('GITHUB_REPO'),
    branch: props.getProperty('GITHUB_BRANCH')
  };
  
  if (!settings.token || !settings.repo || !settings.branch) {
    ui.alert('GitHub settings not found. Please run "GitHub Settings" from the menu.');
    showSetupDialog();
    return;
  }
  
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  
  var dateInfo = extractDateFromEnd(body);
  if (!dateInfo) {
    ui.alert('Error: No valid date found at the end of the document.\nFormat required: "Month DD, YYYY"');
    return;
  }
  
  var paragraphs = body.getParagraphs();
  var title = "";
  var titleFoundIndex = -1;
  
  for (var i = 0; i < dateInfo.index; i++) {
    var p = paragraphs[i];
    var text = p.getText().trim();
    if (!text) continue;
    
    if (p.getHeading() === DocumentApp.ParagraphHeading.HEADING1 || 
        p.getHeading() === DocumentApp.ParagraphHeading.TITLE) {
      title = text;
      titleFoundIndex = i;
      break;
    }
    if (title === "" && text.length > 0) {
      title = text;
      titleFoundIndex = i;
    }
  }
  
  if (!title) {
    title = doc.getName();
    titleFoundIndex = -1;
  }
  
  title = fixEncoding(title);
  
  var rawTextForReadTime = "";
  var excerpt = "";
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
  
  var startIndex = titleFoundIndex + 1;
  var contentHtml = extractFormattedContent(body, dateInfo.index, startIndex);
  
  var slug = generateSlug(title);
  var readTime = calculateReadTime(rawTextForReadTime);
  
  var catResponse = ui.prompt('Article Categories', 'Enter categories separated by comma (e.g., Cloud Security, Risk):\n(Primary category first)', ui.ButtonSet.OK_CANCEL);
  if (catResponse.getSelectedButton() != ui.Button.OK) return;
  
  var categories = catResponse.getResponseText().split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
  if (categories.length === 0) categories = ["General"];
  
  try {
    var fullArticleHtml = generateArticleHTML({ 
      title: title, 
      slug: slug, 
      dateRaw: dateInfo.raw, 
      dateDisplay: dateInfo.display, 
      categories: categories, 
      content: contentHtml, 
      excerpt: excerpt 
    });
    var cardHtml = generateCardHTML({ 
      title: title, 
      slug: slug, 
      dateDisplay: dateInfo.display, 
      excerpt: excerpt, 
      categories: categories, 
      readTime: readTime 
    });
    
    var uploadResult = createOrUpdateGitHubFile("articles/" + slug + ".html", fullArticleHtml, "Publish: " + title, settings);
    updateInsightsHtml(cardHtml, settings);
    updateSitemap(slug, settings);
    
    ui.alert('Published Successfully!\n\nArticle URL: ' + uploadResult.url);
  } catch (e) {
    Logger.log(e);
    ui.alert('Error publishing to GitHub:\n' + e.message);
  }
}

function updateSitemap(slug, settings) {
  var fileName = "sitemap.xml";
  var fileData = getGitHubFile(fileName, settings);
  var sitemapContent = "";
  var today = new Date().toISOString().split('T')[0];
  var articleUrl = BASE_URL + "/articles/" + slug + ".html";
  
  if (fileData) {
    sitemapContent = fileData.content;
    if (sitemapContent.indexOf(articleUrl) === -1) {
      var newEntry = '  <url>\n    <loc>' + articleUrl + '</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n';
      sitemapContent = sitemapContent.replace('</urlset>', newEntry + '</urlset>');
    } else {
      var regex = new RegExp('(<loc>' + articleUrl.replace(/\//g, "\\/") + '<\\/loc>\\s*<lastmod>)[^<]+(<\\/lastmod>)', "s");
      sitemapContent = sitemapContent.replace(regex, "$1" + today + "$2");
    }
  } else {
    sitemapContent = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      '  <url>\n    <loc>' + BASE_URL + '/index.html</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n' +
      '  <url>\n    <loc>' + articleUrl + '</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n' +
      '</urlset>';
  }
  
  createOrUpdateGitHubFile(fileName, sitemapContent, "Update sitemap.xml", settings);
}

function diagnoseBulletCharacter() {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var paragraphs = body.getParagraphs();
  
  Logger.log("=== BULLET CHARACTER DIAGNOSIS ===");
  Logger.log("Total paragraphs: " + paragraphs.length);
  
  // Check ALL paragraphs, not just first 30
  for (var i = 0; i < paragraphs.length; i++) {
    var p = paragraphs[i];
    var text = p.getText();
    var trimmed = text.trim();
    
    if (!trimmed) continue;
    
    var firstChar = trimmed.charAt(0);
    var firstCharCode = trimmed.charCodeAt(0);
    
    // Check if native list
    var isNativeList = false;
    var listType = "none";
    try {
      var li = p.asListItem();
      if (li && li.getListType()) {
        isNativeList = true;
        listType = li.getListType().toString();
      }
    } catch (e) {}
    
    // Log ALL paragraphs that look like they might be lists or are short
    // (less than 150 chars, or native list, or starts with non-letter)
    if (trimmed.length < 150 || isNativeList || firstCharCode < 65) {
      Logger.log("Paragraph " + i + ":");
      Logger.log("  Text: [" + trimmed + "]");
      Logger.log("  First char: '" + firstChar + "' (code: " + firstCharCode + ")");
      Logger.log("  Is native list: " + isNativeList + " (" + listType + ")");
      Logger.log("  Length: " + trimmed.length);
      Logger.log("---");
    }
  }
  
  Logger.log("=== END DIAGNOSIS ===");
}

/**
 * Detects "Ghost List" items based on specific heuristics.
 * 
 * Heuristics:
 * 1. Context: Follows intro text ending with ":"
 * 2. Structure: Starts with Capital letter
 * 3. Exclusion: No definition separators ( - , – , — , : ) indicating a sentence
 * 4. Exclusion: No common verbs (indicates sentence structure)
 * 5. Length: Short word count (typically < 10 words)
 *
 * @param {string} currentText - The text of the current paragraph.
 * @param {string} previousText - The text of the previous paragraph.
 * @param {Object} headingType - The heading level of the current paragraph.
 * @return {boolean} True if the paragraph is likely a ghost list item.
 */
function isGhostListItem(currentText, previousText, headingType) {
  if (!currentText) return false;
  if (headingType !== DocumentApp.ParagraphHeading.NORMAL) return false;
  
  var trimmed = currentText.trim();
  
  // 1. Context Check: Previous paragraph must end with colon
  var prevTrimmed = previousText ? previousText.trim() : "";
  if (!prevTrimmed.endsWith(':')) return false;

  // 2. Basic Formatting: Must start with Capital
  if (!/^[A-Z]/.test(trimmed)) return false;
  
  // 3. Exclusion: Definition Separators (Fix for "Generative AI – Produces...")
  // If text contains " – ", " — ", or ": " in the middle, it's a definition paragraph.
  if (/ [:\-–—] /.test(trimmed)) return false;
  
  // 4. Exclusion: Common Verbs (Fix for "AI Systems – Autonomous...")
  // Noun phrases (list items) rarely have these verbs. Sentences do.
  var verbPattern = /\b(is|are|has|have|produces|generates|creates|uses|provides|can|consists)\b/i;
  if (verbPattern.test(trimmed)) return false;
  
  // 5. Word Count Check
  // List items are usually short (2-8 words). False positives are longer.
  var wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 9) return false;
  
  // 6. Character Length Check
  // Tightened range to exclude long sentences (User requested 2-6 words, we allow buffer)
  if (trimmed.length < 3 || trimmed.length > 60) return false;
  
  return true;
}

/**
 * Extracts text with inline formatting (Bold, Italic, Link, etc.).
 * Uses getTextAttributeIndices() for performance.
 *
 * @param {GoogleAppsScript.Document.Paragraph} element - The paragraph to process.
 * @param {number} [startOffset=0] - Number of characters to skip at the start (for stripping bullets).
 * @return {string} HTML string with formatting tags.
 */
function processFormattedText(element, startOffset) {
  var textObj = element.editAsText();
  var text = textObj.getText();
  var indices = textObj.getTextAttributeIndices();
  var html = "";
  
  // Default offset
  startOffset = startOffset || 0;
  
  // Filter indices to only include those relevant to our content (after offset)
  // We explicitly add the startOffset to ensure we begin processing exactly there
  var processingIndices = [startOffset];
  for (var i = 0; i < indices.length; i++) {
    if (indices[i] > startOffset) {
      processingIndices.push(indices[i]);
    }
  }
  
  for (var i = 0; i < processingIndices.length; i++) {
    var start = processingIndices[i];
    var end = (i + 1 < processingIndices.length) ? processingIndices[i+1] : text.length;
    
    if (start >= text.length) break;
    
    var partText = text.substring(start, end);
    if (!partText) continue;
    
    var attrs = textObj.getAttributes(start);
    var partHtml = partText;
    
    // Escape HTML special characters to prevent breakage
    partHtml = partHtml.replace(/&/g, '&amp;')
                       .replace(/</g, '&lt;')
                       .replace(/>/g, '&gt;');
    
    partHtml = fixEncoding(partHtml);
    
    if (attrs[DocumentApp.Attribute.BOLD]) partHtml = '<strong>' + partHtml + '</strong>';
    if (attrs[DocumentApp.Attribute.ITALIC]) partHtml = '<em>' + partHtml + '</em>';
    if (attrs[DocumentApp.Attribute.UNDERLINE]) partHtml = '<u>' + partHtml + '</u>';
    if (attrs[DocumentApp.Attribute.STRIKETHROUGH]) partHtml = '<span class="line-through">' + partHtml + '</span>';
    if (attrs[DocumentApp.Attribute.LINK_URL]) {
      partHtml = '<a href="' + attrs[DocumentApp.Attribute.LINK_URL] + '" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">' + partHtml + '</a>';
    }
    
    html += partHtml;
  }
  
  return html;
}
