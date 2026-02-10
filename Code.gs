// Configuration - UPDATE THESE
var GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN'; 
var GITHUB_REPO = 'hashp/gitAtlas'; 
var GITHUB_BRANCH = 'main';

/**
 * Main function to publish the article
 */
function publishFullArticle() {
  var doc = DocumentApp.getActiveDocument();
  if (!doc) {
    Logger.log("Please run this script from a Google Doc.");
    return;
  }

  // Get content from the currently active tab
  var body;
  var activeTab = doc.getActiveTab();
  if (activeTab) {
    body = activeTab.asDocumentTab().getBody();
  } else {
    body = doc.getBody();
  }

  // 1. Extract Real Title and Excerpt
  var articleData = extractArticleMetadata(body, doc.getName());
  var title = articleData.title;
  var excerpt = articleData.excerpt;
  var slug = generateSlug(title);
  var date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM dd, yyyy");
  var dateYMD = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  Logger.log("Title: " + title);
  Logger.log("Slug: " + slug);
  Logger.log("Excerpt: " + excerpt);

  // 2. Convert Content
  var markdownContent = convertDocToMarkdown(body, articleData.startIndex);
  var htmlContent = convertMarkdownToHTML(markdownContent); 

  // 3. Generate Files
  // A. _posts markdown file (for Jekyll/GitHub Pages)
  var postFileName = "_posts/" + dateYMD + "-" + slug + ".md";
  var postContent = "---\nlayout: post\ntitle: \"" + title + "\"\ndate: " + dateYMD + "\ncategories: [Cloud Security]\n---\n\n" + markdownContent;
  
  // B. articles/[slug].html (Standalone HTML page)
  var articleFileName = "articles/" + slug + ".html";
  var fullArticleHTML = generateArticleHTML(title, slug, excerpt, dateYMD, date, ["Cloud Security"], htmlContent);

  // 4. Push to GitHub
  uploadToGitHub(postFileName, postContent);
  uploadToGitHub(articleFileName, fullArticleHTML);

  // 5. Update insights.html
  updateInsightsHTML(slug, title, excerpt, date, "cloud-security"); 
}

/**
 * Extracts title and excerpt from document content
 */
function extractArticleMetadata(body, fallbackTitle) {
  var paragraphs = body.getParagraphs();
  var title = null;
  var excerpt = "";
  var startIndex = 0;
  
  // 1. Find Real Title (First Heading 1 or Title)
  for (var i = 0; i < paragraphs.length; i++) {
    var p = paragraphs[i];
    var text = p.getText().trim();
    var heading = p.getHeading();
    
    if (text.length > 0) {
      if (heading === DocumentApp.ParagraphHeading.HEADING1 || heading === DocumentApp.ParagraphHeading.TITLE) {
        title = text;
        startIndex = i + 1; // Content starts after title
        break;
      }
    }
  }
  
  // Fallback: If no Heading 1 found, use the first non-empty paragraph if it looks like a title, otherwise doc name
  if (!title) {
    for (var i = 0; i < paragraphs.length; i++) {
      var text = paragraphs[i].getText().trim();
      if (text.length > 0) {
        title = text;
        startIndex = i + 1;
        break;
      }
    }
    if (!title) title = fallbackTitle;
  }
  
  // 2. Find Excerpt (First Normal Paragraph after title)
  for (var i = startIndex; i < paragraphs.length; i++) {
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
  
  return { title: title, excerpt: excerpt, startIndex: startIndex };
}

function generateSlug(text) {
  return text.toString().toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-')         // Replace multiple - with single -
    .replace(/^-+/, '')             // Trim - from start of text
    .replace(/-+$/, '');            // Trim - from end of text
}

function convertDocToMarkdown(body, startIndex) {
  var paragraphs = body.getParagraphs();
  var md = "";
  
  for (var i = startIndex; i < paragraphs.length; i++) {
    var p = paragraphs[i];
    var text = p.getText();
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
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Noto+Sans:wght@400;500;700&display=swap" rel="stylesheet"/>
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
    <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries,typography"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              "primary": "#0052cc", 
              "primary-dark": "#003d99",
              "accent-blue": "#2b8cee",
              "background-light": "#ffffff",
              "surface-light": "#f8fafc",
              "cool-gray": "#cbd5e1",
              "text-main": "#0f172a",
              "text-muted": "#64748b",
            },
            fontFamily: {
              "display": ["Space Grotesk", "sans-serif"],
              "body": ["Noto Sans", "sans-serif"],
            },
            backgroundImage: {
              'hero-gradient': 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 100%)',
            },
            boxShadow: {
              'soft': '0 20px 40px -10px rgba(0, 50, 100, 0.1)',
              'card': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
              'glow': '0 0 20px rgba(43, 140, 238, 0.3)',
            }
          },
        },
      }
    </script>
    <style>
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .glass-panel {
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
        }
        ::selection {
            background: #e0f2fe;
            color: #0052cc;
        }
        body { min-height: max(884px, 100dvh); }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 font-body antialiased selection:bg-primary/30">
    <video autoplay muted loop playsinline class="fixed inset-0 w-full h-full object-cover" style="z-index: -2; filter: brightness(0.6);">
        <source src="../images/newvid.mp4" type="video/mp4">
    </video>
    <div class="fixed inset-0 bg-slate-900/50 pointer-events-none" style="z-index: -1;"></div>

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
            <h1 class="text-4xl md:text-5xl font-display font-bold text-white mb-6 leading-tight">${title}</h1>
            <div class="flex items-center justify-center gap-4 text-slate-400 text-sm">
                <span>${displayDate}</span>
                <span>•</span>
                <span>AtlasSecurity Team</span>
            </div>
        </header>

        <article class="prose prose-invert prose-lg max-w-none prose-headings:font-display prose-headings:font-bold prose-a:text-blue-400 hover:prose-a:text-blue-300">
            ${content}
        </article>

        <div class="mt-16 pt-8 border-t border-white/10 flex justify-between items-center">
            <a href="../insights.html" class="group inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                <span class="material-symbols-outlined group-hover:-translate-x-1 transition-transform">arrow_back</span>
                Back to Insights
            </a>
        </div>
    </main>

    <!-- Footer Section -->
    <section class="px-5 py-20 bg-white/60 backdrop-blur-md border-t border-slate-100/50 relative z-10">
        <div class="flex flex-col items-center text-center max-w-md mx-auto">
            <div class="p-4 bg-white/50 rounded-2xl mb-6 border border-white/50">
                <span class="material-symbols-outlined text-primary text-3xl">groups</span>
            </div>
            <h3 class="text-2xl font-bold mb-3 text-transparent bg-clip-text bg-gradient-to-r from-primary via-indigo-800 to-blue-500">AtlasSECURITY Community</h3>
            <p class="text-slate-500 text-sm mb-8 leading-relaxed">Get the latest AI governance frameworks and threat reports delivered to your inbox weekly.</p>
            <form class="w-full flex flex-col gap-3">
                <input class="w-full px-4 py-3 bg-white/70 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all shadow-sm" placeholder="Enter your email" type="email"/>
                <button class="w-full px-4 py-3 text-white font-bold rounded-lg transition-all shadow-lg shadow-blue-500/20 bg-gradient-to-r from-primary via-indigo-800 to-blue-500 hover:opacity-90" type="button">
                    Join Community
                </button>
            </form>
            <p class="text-xs text-slate-400 mt-4">No spam. Unsubscribe anytime.</p>
        </div>
    </section>

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

function updateInsightsHTML(slug, title, excerpt, date, category) {
  // This function would fetch insights.html, inject the new card HTML, and push back to GitHub.
  // Implementation depends on specific GitHub API logic (fetching SHA, decoding content, etc.)
  Logger.log("Updating insights.html for: " + title);
}

function uploadToGitHub(fileName, content, sha) {
  var url = "https://api.github.com/repos/" + GITHUB_REPO + "/contents/" + fileName;
  var payload = {
    "message": "Update " + fileName,
    "content": Utilities.base64Encode(content),
    "branch": GITHUB_BRANCH
  };
  if (sha) payload.sha = sha;
  
  var options = {
    method: "put",
    headers: { "Authorization": "Bearer " + GITHUB_TOKEN, "Content-Type": "application/json" },
    payload: JSON.stringify(payload)
  };
  UrlFetchApp.fetch(url, options);
}

function convertMarkdownToHTML(markdown) {
  return markdown.replace(/^### (.*$)/gim, '<h3>$1</h3>').replace(/^## (.*$)/gim, '<h2>$1</h2>').replace(/\n/gim, '<br />');
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
<div id="article-${slug}" class="glass p-8 rounded-2xl group hover:border-indigo-500/40 transition-all duration-300" data-category="${category}">
    <div class="flex items-center gap-3 mb-6">
        <span class="${categoryClass} border text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-tighter">${categoryLabel}</span>
        <span class="text-slate-400 text-xs font-medium uppercase">${date}</span>
        <span class="text-slate-600 text-xs">•</span>
        <span class="text-slate-400 text-xs font-medium uppercase">${readTime}</span>
    </div>
    <h3 class="text-xl md:text-2xl font-bold mb-4 leading-tight text-white group-hover:text-blue-400 transition-colors">${title}</h3>
    <p class="text-slate-300 text-sm leading-relaxed mb-8 line-clamp-3">
        ${excerpt}
    </p>
    <a class="inline-flex items-center text-blue-400 hover:text-blue-300 text-sm font-bold uppercase tracking-widest gap-2 group/link" href="articles/${filename}">
        Read Full Insight 
        <span class="material-symbols-outlined text-sm group-hover/link:translate-x-1 transition-transform">arrow_forward</span>
    </a>
</div>`;
}