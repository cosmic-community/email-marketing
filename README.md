# Email Marketing Platform

![Email Marketing Platform](https://imgix.cosmicjs.com/cae23390-902f-11f0-973b-81e514691025-CleanShot-2025-09-12-at-16-25-032x.png?w=2000&auto=format,compress)

A powerful, AI-enhanced email marketing platform built with Next.js and Cosmic CMS. Create, manage, and send professional email campaigns with intelligent content generation, comprehensive analytics, and advanced media management.

## ✨ Key Features

### 🤖 AI-Powered Content Creation

- **Smart Content Generation**: Generate professional email templates using AI with contextual prompts
- **Intelligent Editing**: Refine and improve existing content with AI-powered suggestions
- **Auto Subject Lines**: Generate compelling subject lines based on email content
- **Context-Aware AI**: Upload brand guidelines, style references, and examples for consistent output
- **AI Tone Configuration**: Customize AI personality (Professional, Friendly, Casual, Formal)

### 📧 Advanced Template Management

- **Rich Text Editor**: Advanced WYSIWYG editor with comprehensive formatting toolbar
- **Template Types**: Support for Welcome, Newsletter, Promotional, and Transactional emails
- **Visual Preview**: Real-time preview with mobile-responsive design
- **Template Library**: Organize and reuse templates across campaigns
- **Template Duplication**: Clone existing templates for quick customization
- **AI Template Enhancement**: Use AI to improve existing templates

### 🎨 Media Library & Asset Management

- **Advanced Media Library**: Complete file management system with drag-and-drop upload
- **Image Optimization**: Automatic image optimization with imgix integration
- **File Organization**: Organize media files in folders with search and filtering
- **Image Cropping**: Built-in image cropper with aspect ratio presets
- **Multiple File Types**: Support for images, PDFs, documents, videos, and audio files
- **Bulk Operations**: Upload multiple files simultaneously with progress tracking
- **File Metadata**: Add alt text, descriptions, and organize with custom folders

### 📋 Contact & List Management

- **Smart Contact Organization**: Manage contacts with custom tags and segmentation
- **List Management**: Create and organize email lists by type and purpose
- **Bulk Operations**: Import contacts via CSV and perform bulk list assignments
- **Contact Status Tracking**: Track active, unsubscribed, and bounced contacts
- **Advanced Search**: Search contacts by name, email, tags, and list membership
- **Contact Export**: Export contact data with filtering options
- **List Analytics**: Track contact counts and engagement by list

### 🚀 Campaign Management

- **Multi-Target Campaigns**: Send to specific lists, contacts, or tagged segments
- **Campaign Scheduling**: Schedule campaigns for optimal send times
- **Progress Tracking**: Real-time sending progress with batch processing
- **Template Snapshots**: Preserve sent campaign content for compliance
- **Campaign Duplication**: Clone successful campaigns for reuse
- **Test Email Sending**: Send test emails before campaign launch
- **Campaign Status Management**: Draft, scheduled, sending, and sent states

### 📊 Analytics & Tracking

- **Comprehensive Stats**: Track sent, delivered, opened, and clicked metrics
- **Click Tracking**: Monitor individual link performance with detailed analytics
- **Bounce Management**: Automatic bounce handling and status updates
- **Unsubscribe Handling**: Built-in unsubscribe management with tracking
- **Campaign Performance**: Detailed performance metrics for each campaign
- **Real-time Updates**: Live tracking of campaign progress and engagement

### ⚙️ Advanced Settings & Configuration

- **Brand Customization**: Configure company branding, logos, and color schemes
- **Email Configuration**: Set sender details, reply-to addresses, and signatures
- **SMTP Integration**: Professional email delivery with Resend integration
- **Domain Configuration**: Custom domain setup for professional sending
- **Webhook Support**: Real-time email event tracking and processing
- **API Access**: RESTful API endpoints for all platform functionality

### 🔐 Authentication & Security

- **Secure Dashboard Access**: Protected admin interface with access codes
- **JWT Authentication**: Secure session management
- **Environment Configuration**: Secure credential management
- **CORS Protection**: Cross-origin request security
- **Rate Limiting**: API rate limiting for security and performance

### 🌐 Public Features

- **Subscription Pages**: Beautiful, responsive subscription forms
- **Unsubscribe Management**: One-click unsubscribe with confirmation
- **Email Tracking**: Open and click tracking with privacy compliance
- **Mobile Responsive**: Optimized for all devices and email clients

## Clone this Project

Want to create your own version of this project with all the content and structure? Clone this Cosmic bucket and code repository to get started instantly:

[![Clone this Project](https://img.shields.io/badge/Clone%20this%20Project-29abe2?style=for-the-badge&logo=cosmic&logoColor=white)](https://app.cosmicjs.com/projects/new?clone_bucket=68ae7458a116be3a9e5f28f0&clone_repository=68ae7bd1a116be3a9e5f2908)

## 🛠️ Technology Stack

- **Frontend**: Next.js 14 with TypeScript and App Router
- **Styling**: Tailwind CSS with custom design system and animations
- **CMS**: Cosmic CMS for content management and media storage
- **Email Service**: Resend for reliable email delivery with webhook support
- **Background Jobs**: Inngest for reliable, timeout-free campaign sending
- **AI Integration**: Cosmic AI for intelligent content generation
- **Authentication**: Custom JWT-based auth system with secure sessions
- **Media Processing**: imgix for automatic image optimization and transformations
- **File Handling**: React Dropzone for drag-and-drop file uploads
- **UI Components**: Radix UI primitives with custom styling
- **Deployment**: Vercel with automatic deployments and edge functions

## 📦 What's Included

### Core Components

- **Dashboard**: Comprehensive overview with key metrics and quick actions
- **Media Library**: Advanced file management with cropping and organization
- **Template Editor**: AI-enhanced content creation interface with rich formatting
- **Contact Manager**: Advanced contact and list management with bulk operations
- **Campaign Builder**: Intuitive campaign creation workflow with targeting options
- **Analytics Dashboard**: Detailed performance tracking and engagement metrics
- **Settings Panel**: Complete platform configuration and branding options

### API Endpoints

- **Campaign Management**: Create, update, send, and track campaigns
- **Contact Operations**: CRUD operations with bulk import/export
- **Template Management**: AI-powered template creation and editing
- **Media Operations**: File upload, organization, and optimization
- **Analytics Tracking**: Email opens, clicks, and engagement metrics
- **Webhook Handlers**: Real-time email event processing
- **Authentication**: Secure login and session management

### UI/UX Features

- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Intuitive Navigation**: Clean, professional interface with contextual actions
- **Real-time Updates**: Live progress indicators and status updates
- **Accessibility**: WCAG compliant design patterns and keyboard navigation
- **Dark Mode Support**: Consistent theming across all components
- **Loading States**: Smooth loading animations and progress indicators

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or Bun runtime
- Cosmic CMS account ([cosmicjs.com](https://www.cosmicjs.com))
- Resend account for email delivery ([resend.com](https://resend.com))
- Inngest account for background jobs ([inngest.com](https://www.inngest.com))

### Installation

1. **Clone the repository**

   ```bash
   git clone [repository-url]
   cd email-marketing
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Update the following variables:

   ```env
   # Cosmic CMS Configuration
   COSMIC_BUCKET_SLUG=your-bucket-slug-here
   COSMIC_READ_KEY=your-cosmic-read-key-here
   COSMIC_WRITE_KEY=your-cosmic-write-key-here

   # Email Service (Resend) - Required for sending emails
   RESEND_API_KEY=your-resend-api-key-here

   # Inngest Background Jobs - Required for campaign sending
   INNGEST_EVENT_KEY=inngest_event_key_YOUR_KEY
   INNGEST_SIGNING_KEY=signkey-prod-YOUR_KEY

   # Authentication - Required for dashboard access
   ACCESS_CODE=your-secret-access-code-here

   # Application URL - Required for email tracking and unsubscribe links
   NEXT_PUBLIC_APP_URL=http://localhost:3000

   # Optional: Cron job security for scheduled campaign checking
   CRON_SECRET=your-cron-secret-for-scheduled-campaigns

   # Optional: Development/Production environment
   NODE_ENV=development
   ```

4. **Set up Cosmic CMS content models**

   - The app will automatically create required Object Types on first run
   - Object Types: Email Lists, Email Contacts, Email Templates, Marketing Campaigns, Settings

5. **Set up Inngest for background jobs** (Required for campaign sending)

   - Sign up at [inngest.com](https://www.inngest.com)
   - Get your Event Key and Signing Key from Settings → Keys
   - Add both keys to your `.env.local` file
   - See [docs/INNGEST_QUICK_START.md](./docs/INNGEST_QUICK_START.md) for detailed setup

6. **Run the development server**

   ```bash
   bun dev
   ```

7. **Start Inngest Dev Server** (in a separate terminal)

   ```bash
   npx inngest-cli@latest dev
   ```

   Visit `http://localhost:8288` to see the Inngest dashboard locally.

8. **Open your browser**
   Navigate to `http://localhost:3000` to access the application.

## 📖 Usage Guide

### Getting Started

1. **Initial Setup**

   - Configure your settings with sender information and branding
   - Set your preferred AI tone and company details
   - Upload your logo and brand assets to the media library

2. **Create Email Lists**

   - Organize contacts into targeted lists
   - Import existing contacts via CSV upload
   - Set up list categories for better organization

3. **Build Templates**

   - Use AI to generate content from simple prompts
   - Customize with the rich text editor and media library
   - Save templates for reuse across campaigns

4. **Launch Campaigns**
   - Select target lists or specific contacts
   - Schedule or send immediately
   - Monitor progress and analytics in real-time

### Media Library Usage

1. **Upload Files**

   - Drag and drop files directly into the media library
   - Support for images, PDFs, documents, videos, and audio
   - Automatic optimization and format conversion

2. **Organize Content**

   - Create folders to organize your media files
   - Add alt text and descriptions for better accessibility
   - Search and filter files by type, folder, or date

3. **Image Editing**
   - Use the built-in image cropper for perfect sizing
   - Multiple aspect ratio presets for different use cases
   - Automatic imgix optimization for web delivery

### AI Content Generation Tips

- **Be Specific**: Provide detailed prompts for better results
- **Use Context**: Upload brand guidelines or examples for consistency
- **Iterate**: Use the AI editing feature to refine content
- **Test Variations**: Generate multiple versions and A/B test performance

## 🔧 Configuration

### Email Service Setup

Configure Resend for reliable email delivery:

- Add your domain to Resend dashboard
- Set up DNS records for authentication (SPF, DKIM, DMARC)
- Configure webhook endpoints for delivery tracking
- Test email delivery with the built-in testing tools

### AI Integration

AI features are powered by Cosmic AI and automatically available:

- Configurable AI personality and tone settings
- Context-aware content generation with brand consistency
- Built-in content optimization and enhancement
- Template generation from simple prompts

### Inngest Background Jobs

Campaign sending runs reliably via Inngest with no timeout limits:

- **No Timeout Limits**: Send campaigns with 100K+ contacts without interruption
- **Automatic Retries**: Failed operations retry automatically with exponential backoff
- **Real-time Monitoring**: Track campaign progress in Inngest Dashboard
- **Scheduled Campaigns**: Dual-system scheduler (Vercel + Inngest) for reliability
- **Progress Tracking**: Real-time updates visible in your dashboard
- **Setup**: Sign up at [inngest.com](https://www.inngest.com) and add API keys
- **Documentation**: See [docs/INNGEST_QUICK_START.md](./docs/INNGEST_QUICK_START.md)

### Media Configuration

Set up media handling and optimization:

- Configure imgix for automatic image optimization
- Set up file upload limits and allowed types
- Configure folder organization and naming conventions
- Set up automatic alt text generation for accessibility

### Customization Options

- **Branding**: Upload logos, set brand colors, and customize themes
- **Templates**: Create custom template layouts and styles
- **Tracking**: Configure analytics and conversion goals
- **Integrations**: Connect with external tools via API endpoints
- **Webhooks**: Set up real-time event processing for email events

## 📊 Performance & Scalability

- **Efficient Rendering**: Server-side rendering with Next.js App Router
- **Optimized Images**: Automatic image optimization with imgix CDN
- **Background Jobs**: Inngest handles campaign sending with no timeout limits (unlimited execution time)
- **Batch Processing**: Handles campaigns of any size (tested with 36K+ contacts)
- **Automatic Retries**: Failed operations retry automatically with Inngest
- **Error Recovery**: Robust error handling and retry logic for failed sends
- **Query Optimization**: 4-6x faster database queries with minimal field fetching
- **Duplicate Prevention**: 3-layer system prevents duplicate emails (100% safe)
- **Caching Strategy**: Intelligent caching for improved performance
- **Database Optimization**: Efficient Cosmic CMS queries with proper indexing
- **Scalable Architecture**: Separates UI (Vercel) from background processing (Inngest)

## 🔒 Security Features

- **Authentication**: Secure JWT-based authentication system
- **Access Control**: Protected routes and API endpoints
- **Data Validation**: Input sanitization and validation
- **CORS Protection**: Cross-origin request security
- **Rate Limiting**: API rate limiting to prevent abuse
- **Environment Security**: Secure environment variable management

## 🌐 Deployment

### Vercel Deployment (Recommended)

1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard (including Inngest keys)
3. Enable automatic deployments on push
4. After deployment, sync Inngest:
   - Go to [Inngest Dashboard](https://app.inngest.com)
   - Navigate to Apps → Sync App
   - Enter: `https://your-domain.vercel.app/api/inngest`
   - Verify both functions appear: `send-campaign` and `check-scheduled-campaigns`
5. Configure custom domain if needed

**Important**: Campaign sending will not work until Inngest is synced!

### Manual Deployment

Deploy to any Node.js hosting platform that supports Next.js 14+.

## 📚 Documentation

Comprehensive documentation is available in the `/docs` folder:

- **[INNGEST_QUICK_START.md](./docs/INNGEST_QUICK_START.md)** - 5-minute Inngest setup guide
- **[INNGEST_MIGRATION_COMPLETE.md](./docs/INNGEST_MIGRATION_COMPLETE.md)** - Complete migration details and architecture
- **[CAMPAIGN_OPTIMIZATIONS.md](./docs/CAMPAIGN_OPTIMIZATIONS.md)** - Performance optimizations and technical deep-dive

### Key Topics Covered

- Setting up Inngest for timeout-free campaign sending
- Background job processing architecture
- Database query optimizations (4-6x speedup)
- Duplicate email prevention system
- Deployment checklist and troubleshooting
- Real-time progress tracking
- Scheduled campaign handling

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the MIT License.

## 🆘 Support

- **Documentation**: Check the [/docs](./docs) folder for detailed guides
- **Inngest Support**: [Inngest Documentation](https://www.inngest.com/docs)
- **Cosmic CMS**: [Cosmic Documentation](https://www.cosmicjs.com/docs)
- **Issues**: Open an issue on GitHub for bug reports or feature requests
