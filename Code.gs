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
  var fullArticleHTML = generateArticleHTML(title, slug, excerpt, date, htmlContent);

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

function generateArticleHTML(title, slug, excerpt, date, content) {
  // Basic HTML template matching your site style
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title} - AtlasSecurity</title>
</head>
<body class="text-slate-100 bg-slate-950">
    <article class="max-w-3xl mx-auto py-20 px-6">
        <h1 class="text-4xl font-bold mb-6">${title}</h1>
        <div class="text-slate-400 mb-8">${date}</div>
        <div class="prose prose-invert">
            ${content}
        </div>
    </article>
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