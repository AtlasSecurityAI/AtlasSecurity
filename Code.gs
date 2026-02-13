// ==========================================
// MENU & SETTINGS
// ==========================================

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Atlas Security')
    .addItem('Publish Article', 'publishFullArticle')
    .addSeparator()
    .addItem('GitHub Settings', 'showSetupDialog')
    .addToUi();
}

function showSetupDialog() {
  var ui = DocumentApp.getUi();
  var props = PropertiesService.getUserProperties();
  
  var token = props.getProperty('GITHUB_TOKEN') || '';
  var repo = props.getProperty('GITHUB_REPO') || 'hashp/gitAtlas';
  var branch = props.getProperty('GITHUB_BRANCH') || 'main';
  
  var result = ui.prompt(
    'GitHub Configuration',
    'Enter format: TOKEN|REPO|BRANCH\nExample: ghp_xyz|username/repo|main\n\nCurrent Repo: ' + repo,
    ui.ButtonSet.OK_CANCEL
  );
  
  if (result.getSelectedButton() == ui.Button.OK) {
    var input = result.getResponseText().split('|');
    if (input.length === 3) {
      saveSettings(input[0].trim(), input[1].trim(), input[2].trim());
      ui.alert('Settings saved successfully.');
    } else {
      ui.alert('Invalid format. Please use: TOKEN|REPO|BRANCH');
    }
  }
}

function saveSettings(token, repo, branch) {
  var props = PropertiesService.getUserProperties();
  props.setProperties({
    'GITHUB_TOKEN': token,
    'GITHUB_REPO': repo,
    'GITHUB_BRANCH': branch
  });
}

function getSettings() {
  var props = PropertiesService.getUserProperties();
  var token = props.getProperty('GITHUB_TOKEN');
  var repo = props.getProperty('GITHUB_REPO');
  var branch = props.getProperty('GITHUB_BRANCH');
  
  if (!token || !repo || !branch) {
    throw new Error('GitHub settings not found. Please run "GitHub Settings" from the menu.');
  }
  
  return { token: token, repo: repo, branch: branch };
}

// ==========================================
// MAIN PUBLISH LOGIC
// ==========================================

/**
 * Main function to publish the article
 */
function publishFullArticle() {
  // 1. Validate Environment
  var doc = DocumentApp.getActiveDocument();
  if (!doc) {
    DocumentApp.getUi().alert("Please run this script from a Google Doc.");
    return;
  }

  // 2. Get Settings
  var settings = getSettings(); // Will throw if missing

  // 3. Get Content Body
  var body;
  var activeTab = doc.getActiveTab();
  if (activeTab) {
    body = activeTab.asDocumentTab().getBody();
  } else {
    body = doc.getBody();
  }

  // 4. Extract Date (From End)
  var dateInfo = extractDateFromEnd(body);
  var dateStr = dateInfo.dateRaw;
  var dateDisplay = dateInfo.dateDisplay;
  var dateYMD = dateInfo.dateISO;
  var endIndex = dateInfo.paragraphIndex;

  if (!dateStr) throw new Error("No valid date found at end of document");

  // 5. Extract Title & Excerpt (From Start)
  var contentInfo = extractTitleAndExcerpt(body, 0, endIndex);
  var title = contentInfo.title;
  var excerpt = contentInfo.excerpt;
  var startIndex = contentInfo.contentStartIndex;
  
  var slug = generateSlug(title);
  
  Logger.log("Title: " + title);
  Logger.log("Date: " + dateDisplay);
  Logger.log("Slug: " + slug);
  Logger.log("Excerpt: " + excerpt);

  // 6. Convert Content (Middle)
  var markdownContent = convertDocToMarkdown(body, startIndex, endIndex);
  var htmlContent = convertMarkdownToHTML(markdownContent); 
  
  // Calculate Read Time (approx 200 words/min)
  var wordCount = markdownContent.split(/\s+/).length;
  var readTime = Math.ceil(wordCount / 200) + " MIN READ";

  // 7. Generate Files
  // A. _posts markdown file (for Jekyll/GitHub Pages)
  var postFileName = "_posts/" + dateYMD + "-" + slug + ".md";
  var postContent = "---\nlayout: post\ntitle: \"" + title + "\"\ndate: " + dateYMD + "\ncategories: [Cloud Security]\n---\n\n" + markdownContent;
  
  // B. articles/[slug].html (Standalone HTML page)
  var articleFileName = "articles/" + slug + ".html";
  var fullArticleHTML = generateArticleHTML(title, slug, excerpt, dateYMD, dateDisplay, ["Cloud Security"], htmlContent);

  // 8. Push to GitHub
  uploadToGitHub(postFileName, postContent, settings);
  uploadToGitHub(articleFileName, fullArticleHTML, settings);

  // 9. Generate Card HTML (for manual update or future automation)
  var cardHTML = generateCardHTML(title, excerpt, dateDisplay, readTime, "cloud-security", slug, slug + ".html");
  Logger.log("Card HTML generated:\n" + cardHTML);
  
  // 10. Update insights.html
  updateInsightsHTML(slug, title, excerpt, dateDisplay, "cloud-security", settings, cardHTML, readTime); 
  
  DocumentApp.getUi().alert("Published successfully!\n\nFiles created:\n" + postFileName + "\n" + articleFileName);
}

// ==========================================
// EXTRACTION & HELPER FUNCTIONS
// ==========================================

/**
 * Extracts date from the last non-empty paragraph
 */
function extractDateFromEnd(body) {
  var paragraphs = body.getParagraphs();
  var datePattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/;
  
  // Loop BACKWARDS from end to find date
  for (var i = paragraphs.length - 1; i >= 0; i--) {
    var text = paragraphs[i].getText().trim();
    if (text.length > 0) {
      if (datePattern.test(text)) {
        var date = new Date(text);
        return {
          dateRaw: text,
          dateISO: Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd"),
          dateDisplay: Utilities.formatDate(date, Session.getScriptTimeZone(), "MMM dd, yyyy").toUpperCase(),
          paragraphIndex: i
        };
      }
      break; // Stop at first non-empty paragraph from end
    }
  }
  return { dateRaw: null, dateISO: null, dateDisplay: null, paragraphIndex: null };
}

/**
 * Extracts Title and Excerpt from the beginning of the document
 */
function extractTitleAndExcerpt(body, startIndex, endIndex) {
  var paragraphs = body.getParagraphs();
  var title = "";
  var excerpt = "";
  var contentStartIndex = startIndex;
  var limit = (endIndex !== undefined && endIndex !== null) ? endIndex : paragraphs.length;

  // 1. Find Title
  for (var i = startIndex; i < limit; i++) {
    var p = paragraphs[i];
    var text = p.getText().trim();
    var heading = p.getHeading();
    
    if (text.length > 0) {
      if (heading === DocumentApp.ParagraphHeading.HEADING1 || heading === DocumentApp.ParagraphHeading.TITLE) {
        title = text;
        contentStartIndex = i + 1;
        break;
      }
    }
  }

  // Fallback Title
  if (!title) {
    for (var i = startIndex; i < limit; i++) {
      var text = paragraphs[i].getText().trim();
      if (text.length > 0) {
        title = text;
        contentStartIndex = i + 1;
        break;
      }
    }
    if (!title) title = DocumentApp.getActiveDocument().getName();
  }
  
  title = fixEncoding(title);

  // 2. Find Excerpt (Look ahead from contentStartIndex)
  for (var i = contentStartIndex; i < limit; i++) {
    var p = paragraphs[i];
    var text = p.getText().trim();
    // Skip empty lines or sub-headings
    if (text.length > 0 && p.getHeading() === DocumentApp.ParagraphHeading.NORMAL) {
      excerpt = text;
      // Truncate to ~150 chars
      if (excerpt.length > 150) {
        excerpt = excerpt.substring(0, 150).trim() + "...";
      }
      break;
    }
  }
  excerpt = fixEncoding(excerpt);

  return {
    title: title,
    excerpt: excerpt,
    contentStartIndex: contentStartIndex
  };
}

/**
 * Fixes encoding issues where apostrophes appear as question marks
 */
function fixEncoding(text) {
  if (!text) return text;
  
  // 1. Replace smart quotes with straight quotes (Preventative)
  text = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

  // 2. Replace ? encoding errors (Curative)
  // Replace ? between letters (It?s -> It's)
  text = text.replace(/([a-zA-Z])\?([a-zA-Z])/g, "$1'$2");
  // Replace ? at start of word (?tis -> 'tis)
  text = text.replace(/(^|\s)\?([a-zA-Z])/g, "$1'$2");
  
  return text;
}

function generateSlug(text) {
  text = fixEncoding(text); // Ensure title is clean before slugifying
  return text.toString().toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

function convertDocToMarkdown(body, startIndex, endIndex) {
  var paragraphs = body.getParagraphs();
  var md = "";
  var limit = (endIndex !== undefined) ? endIndex : paragraphs.length;
  
  for (var i = startIndex; i < limit; i++) {
    var p = paragraphs[i];
    var text = fixEncoding(p.getText()); // Apply encoding fix
    var heading = p.getHeading();
    
    if (heading === DocumentApp.ParagraphHeading.HEADING2) {
      md += "## " + text + "\n\n";
    } else if (heading === DocumentApp.ParagraphHeading.HEADING3) {
      md += "### " + text + "\n\n";
    } else if (text.trim() !== "") {
      md += text + "\n\n";
    }
  }
  return md;
}

// ==========================================
// HTML GENERATION
// ==========================================

function generateArticleHTML(title, slug, excerpt, date, displayDate, categories, content) {
  var category = (categories && categories.length > 0) ? categories[0] : "Article";

  // Basic HTML template matching your site style
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8"/>
    <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
    <meta name="description" content="${excerpt}"/>
    <title>${title} - AtlasSecurity</title>
    <link href="https://fonts.googleapis.com" rel="preconnect"/>
    <link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&amp;family=Plus+Jakarta+Sans:wght@400;600;700;800&amp;display=swap" rel="stylesheet"/>
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet"/>
    <script src="https://cdn.tailwindcss.com?plugins=forms,typography"></script>
    <script>
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    colors: {
                        primary: "#6366f1",
                        "brand-indigo": "#4f46e5",
                        "brand-blue": "#1d4ed8",
                    },
                    fontFamily: {
                        sans: ["Inter", "sans-serif"],
                        display: ["Plus Jakarta Sans", "sans-serif"],
                    },
                    borderRadius: {
                        DEFAULT: "0.75rem",
                        "2xl": "1rem",
                    },
                },
            },
        };
    </script>
    <style type="text/tailwindcss">
        .glass {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }
        .glass-panel {
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
        }
    </style>
    <style>
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
      .glass-content p, .glass-content li {
        color: #1a1a1a !important;
      }
      .glass-content a {
        color: #0052cc;
      }
    </style>
</head>
<body class="text-slate-100 min-h-screen font-sans selection:bg-primary/30">
    <video autoplay muted loop playsinline class="fixed inset-0 w-full h-full object-cover" style="z-index: -2; filter: brightness(0.95);">
        <source src="../images/newvid.mp4" type="video/mp4">
    </video>
    <div class="fixed inset-0 bg-slate-800/40 pointer-events-none" style="z-index: -1;"></div>

    <!-- Navigation -->
    <nav class="fixed top-0 w-full z-50 glass-panel border-b border-slate-100 transition-all duration-300">
        <div class="relative flex items-center justify-center px-5 py-6">
            <a href="../index.html" class="flex items-center gap-3">
                <span class="material-symbols-outlined text-transparent bg-clip-text bg-gradient-to-r from-[#0052cc] to-indigo-600" style="font-size: 32px;">security</span>
                <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">Atlas<span class="text-transparent bg-clip-text bg-gradient-to-r from-[#0052cc] to-indigo-600">SECURITY</span></h1>
            </a>
            <button id="menu-button" class="absolute right-5 p-2 text-slate-600 hover:text-primary transition-colors rounded-full hover:bg-slate-50">
                <span class="material-symbols-outlined" style="font-size: 24px;">menu</span>
            </button>
            <div id="menu" class="hidden absolute top-16 right-5 bg-white rounded-lg shadow-lg p-2">
                <a href="../index.html" class="block px-4 py-2 text-slate-700 hover:bg-slate-100">Home</a>
                <a href="../about.html" class="block px-4 py-2 text-slate-700 hover:bg-slate-100">About</a>
                <a href="../insights.html" class="block px-4 py-2 text-slate-700 hover:bg-slate-100">Insights</a>
            </div>
        </div>
    </nav>

    <main class="relative z-10 pt-32 pb-24 px-6 max-w-4xl mx-auto">
        <header class="mb-12 text-center">
             <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold uppercase tracking-wider mb-6">
                <span>${category}</span>
            </div>
            <h1 class="text-4xl md:text-5xl font-display font-extrabold text-white mb-6 leading-tight tracking-tight">${title}</h1>
            <div class="flex items-center justify-center gap-4 text-slate-300 text-sm font-medium">
                <span>${displayDate}</span>
            </div>
        </header>

        <article class="glass-content prose prose-lg max-w-none prose-headings:font-display prose-headings:font-bold">
            ${content}
        </article>

        <div class="mt-16 pt-8 border-t border-white/10 flex justify-between items-center">
            <a href="../insights.html" class="group inline-flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
                <span class="material-symbols-outlined group-hover:-translate-x-1 transition-transform">arrow_back</span>
                Back to Insights
            </a>
        </div>
        
        <!-- Subscribe Section -->
        <div class="mt-20">
            <div class="bg-slate-900/90 backdrop-blur-md border border-indigo-500/20 rounded-[2rem] p-12 text-center relative overflow-hidden shadow-2xl">
                <div class="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] rounded-full -mr-32 -mt-32"></div>
                <div class="absolute bottom-0 left-0 w-64 h-64 bg-brand-blue/10 blur-[100px] rounded-full -ml-32 -mb-32"></div>
                <div class="relative z-10">
                    <div class="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center mx-auto mb-6">
                        <span class="material-symbols-outlined text-primary">mail</span>
                    </div>
                    <h2 class="text-3xl font-display font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 to-blue-800">Stay Ahead of Security & AI Risks</h2>
                    <p class="text-slate-400 mb-10 max-w-lg mx-auto">
                        Subscribe to receive our bi-weekly Security &amp; AI Intelligence Report, delivered directly to your inbox.
                    </p>
                    <form class="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
                        <input class="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:ring-1 focus:ring-primary focus:border-primary transition-all outline-none" placeholder="Enter your email" required="" type="email"/>
                        <button class="bg-primary text-white px-8 py-3 rounded-xl font-bold text-sm uppercase tracking-wider hover:bg-indigo-500 hover:shadow-lg hover:shadow-primary/20 transition-all" type="submit">Join Community</button>
                    </form>
                    <p class="mt-4 text-[10px] text-slate-500 uppercase tracking-widest">NO SPAM. JUST INTELLIGENCE. UNSUBSCRIBE ANYTIME.</p>
                </div>
            </div>
        </div>
    </main>

    <!-- Bottom Nav -->
    <nav class="fixed bottom-0 w-full z-50 bg-white/90 backdrop-blur-lg border-t border-slate-200 safe-area-bottom">
        <div class="flex items-center justify-around px-2 py-3 pb-6 md:pb-3">
            <a class="flex flex-col items-center gap-1 group w-16 text-slate-400 hover:text-slate-900 transition-colors" href="../index.html">
                <div class="p-1 rounded-full group-hover:bg-slate-50 transition-colors">
                    <span class="material-symbols-outlined text-2xl">home</span>
                </div>
                <span class="text-[10px] font-medium">AtlasSecurity</span>
            </a>
            <a class="flex flex-col items-center gap-1 group w-16 text-slate-400 hover:text-slate-900 transition-colors" href="../about.html">
                <div class="p-1 rounded-full group-hover:bg-slate-50 transition-colors">
                    <span class="material-symbols-outlined text-2xl">info</span>
                </div>
                <span class="text-[10px] font-medium">About</span>
            </a>
            <a class="flex flex-col items-center gap-1 group w-16" href="../insights.html">
                <div class="p-1 rounded-full bg-blue-50 transition-colors">
                    <span class="material-symbols-outlined text-2xl text-primary">article</span>
                </div>
                <span class="text-[10px] font-bold text-primary whitespace-nowrap text-center">Tech Insights</span>
            </a>
        </div>
    </nav>

    <script>
        const menuButton = document.getElementById('menu-button');
        const menu = document.getElementById('menu');

        menuButton.addEventListener('click', () => {
            menu.classList.toggle('hidden');
        });
    </script>
</body>
</html>`;
}

function generateCardHTML(title, excerpt, date, readTime, category, slug, filename) {
  var categoryConfig = {
    "cloud-security": "bg-blue-500/20 text-blue-300 border-blue-500/30",
    "ai-security": "bg-purple-500/20 text-purple-300 border-purple-500/30",
    "governance": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    "risk": "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "compliance": "bg-teal-500/20 text-teal-300 border-teal-500/30"
  };
  
  var categoryClass = categoryConfig[category] || categoryConfig["cloud-security"];
  var categoryLabel = category.replace(/-/g, ' ').toUpperCase();
  
  return `
<article id="article-${slug}" class="bg-slate-900/90 backdrop-blur-md border border-indigo-500/20 shadow-2xl rounded-2xl relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300" data-category="${category}">
    <a href="articles/${filename}" class="block p-6 md:p-8 h-full">
        <div class="flex items-center gap-3 mb-4 flex-wrap">
            <span class="px-3 py-1 rounded-full text-xs font-semibold tracking-wider border ${categoryClass}">
              ${categoryLabel}
            </span>
            <span class="text-slate-400 text-xs">${date}</span>
            <span class="text-slate-400 text-xs">${readTime}</span>
        </div>
        
        <h3 class="text-xl md:text-2xl font-bold text-white mb-3 group-hover:text-blue-300 transition-colors line-clamp-2">
          ${title}
        </h3>
        
        <p class="text-slate-300 text-sm leading-relaxed mb-6 line-clamp-3">
          ${excerpt}
        </p>
        
        <div class="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors group/link">
          READ FULL INSIGHT
          <svg class="w-4 h-4 group-hover/link:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path>
          </svg>
        </div>
    </a>
</article>`;
}

function updateInsightsHTML(slug, title, excerpt, date, category, settings, cardHTML, readTime) {
  var fileName = "insights.html";
  var url = "https://api.github.com/repos/" + settings.repo + "/contents/" + fileName;
  
  var options = {
    method: "get",
    headers: { "Authorization": "Bearer " + settings.token }
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());
    var decodedContent = Utilities.newBlob(Utilities.base64Decode(data.content)).getDataAsString();
    var sha = data.sha;
    
    var insertionPoint = '<div class="grid grid-cols-1 md:grid-cols-2 gap-8">';
    if (decodedContent.indexOf(insertionPoint) !== -1) {
      var newContent = decodedContent.replace(insertionPoint, insertionPoint + "\n\n    <!-- " + title + " -->\n" + cardHTML);
      uploadToGitHub(fileName, newContent, settings, sha);
    } else {
      throw new Error("Insertion point not found in insights.html");
    }
  } catch (e) {
    Logger.log("Error updating insights.html: " + e.toString());
    DocumentApp.getUi().alert("Error updating insights.html: " + e.toString());
  }

  // 2. Update index.html (Recent Articles Slider)
  if (readTime) {
    updateIndexHTML(slug, title, excerpt, date, category, settings, readTime);
  }
}

function updateIndexHTML(slug, title, excerpt, date, category, settings, readTime) {
  var fileName = "index.html";
  var url = "https://api.github.com/repos/" + settings.repo + "/contents/" + fileName;
  
  var options = {
    method: "get",
    headers: { "Authorization": "Bearer " + settings.token }
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());
    var decodedContent = Utilities.newBlob(Utilities.base64Decode(data.content)).getDataAsString();
    var sha = data.sha;
    
    var slideHTML = generateSlideHTML(title, excerpt, date, readTime, category, slug, slug + ".html");
    var insertionPoint = '<div class="swiper-wrapper">';
    
    if (decodedContent.indexOf(insertionPoint) !== -1) {
      var newContent = decodedContent.replace(insertionPoint, insertionPoint + "\n        <!-- " + title + " -->\n" + slideHTML);
      uploadToGitHub(fileName, newContent, settings, sha);
    } else {
      Logger.log("Insertion point not found in index.html");
    }
  } catch (e) {
    Logger.log("Error updating index.html: " + e.toString());
    DocumentApp.getUi().alert("Error updating index.html: " + e.toString());
  }
}

function generateSlideHTML(title, excerpt, date, readTime, category, slug, filename) {
  var categoryLabel = category.replace(/-/g, ' ').toUpperCase();
  // Using a default image since dynamic image extraction isn't implemented yet
  var defaultImage = "https://lh3.googleusercontent.com/aida-public/AB6AXuBHWux8iAKCKWnCwFSlJCTo97_H4beCb-gemOkvwghR12h9nLkX68vtl037ki-OXLCK42xfr8l3mdbtrEI4f3AxbbWU6JfMT-y4crb9AQ5OvyMsKDtwbCxP_n4YX95Jl69KPm4jQ_gnC1ughgUwfZzyM5qUeyI0csJ54a6Kx2YjVopSf9NaWOz6GOpsYYdEmj_Jq0mzz9jHFoWyGHKDFlngkeXTl_Wrwzy2REyVlksgjBAgGYxneMQ4ZTmXvlJK1O-v_JNQMQovCLA";
  
  return `        <div class="swiper-slide h-auto">
            <a href="articles/${filename}" class="block group bg-white/80 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col border border-white/50 h-full cursor-pointer">
                <div class="relative h-60 w-full overflow-hidden">
                    <img alt="Article thumbnail" class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" src="${defaultImage}"/>
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent opacity-80"></div>
                    <div class="absolute top-4 left-4">
                        <span class="px-3 py-1 bg-white/95 backdrop-blur-sm text-xs font-bold text-slate-900 rounded-md shadow-sm uppercase tracking-wider">${categoryLabel}</span>
                    </div>
                </div>
                <div class="p-7 flex flex-col flex-grow">
                    <div class="flex items-center gap-3 text-xs font-bold text-slate-400 mb-4 uppercase tracking-wide">
                        <span class="text-primary">${date}</span>
                        <span>•</span>
                        <span>${readTime}</span>
                    </div>
                    <h3 class="text-2xl font-bold text-slate-900 leading-tight mb-3 group-hover:text-primary transition-colors">${title}</h3>
                    <div class="flex flex-col gap-4 mt-auto pt-5 border-t border-slate-50">
                        <p class="text-slate-500 text-sm leading-relaxed line-clamp-2">${excerpt}</p>
                        <span class="text-primary font-bold text-sm flex items-center gap-1 ml-auto group-hover:translate-x-1 transition-transform">
                            Read full article <span class="material-symbols-outlined text-sm">arrow_forward</span>
                        </span>
                    </div>
                </div>
            </a>
        </div>`;
}

function uploadToGitHub(fileName, content, settings, sha) {
  var url = "https://api.github.com/repos/" + settings.repo + "/contents/" + fileName;
  var payload = {
    "message": "Update " + fileName,
    "content": Utilities.base64Encode(content),
    "branch": settings.branch
  };
  if (sha) payload.sha = sha;
  
  var options = {
    method: "put",
    headers: { "Authorization": "Bearer " + settings.token, "Content-Type": "application/json" },
    payload: JSON.stringify(payload)
  };
  
  try {
    UrlFetchApp.fetch(url, options);
    Logger.log("Uploaded: " + fileName);
  } catch (e) {
    Logger.log("Error uploading " + fileName + ": " + e.toString());
    // In a real scenario, you might want to handle 422 (file exists) by fetching SHA first
  }
}

function convertMarkdownToHTML(markdown) {
  return markdown.replace(/^### (.*$)/gim, '<h3>$1</h3>').replace(/^## (.*$)/gim, '<h2>$1</h2>').replace(/\n/gim, '<br />');
}