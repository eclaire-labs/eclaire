# Mobile Layout Components

This directory contains the mobile-specific layout components that provide a truly mobile-native experience for the Eclaire frontend.

## Mobile-First Design Principles

- **No Top Bar**: Maximum screen real estate by eliminating desktop top bar
- **Full-Screen Views**: Each tab provides immersive, full-screen experience
- **Bottom Navigation**: Thumb-friendly tab bar at bottom follows mobile conventions
- **Smooth Transitions**: Native-like slide animations between views

## Components

### MobileTabBar (`mobile-tab-bar.tsx`)
Bottom navigation tab bar with four main sections:
- **Home**: Dashboard view with notification badges for due items
- **Chat**: Full-screen assistant interface
- **Folders**: Full-screen navigation menu sliding in from left
- **Settings**: Settings page

### MobileLayout (`mobile-layout.tsx`) 
Main layout wrapper for mobile devices that:
- **NO TOP BAR**: Uses entire screen height for content
- Uses single-column layout instead of desktop's 3-column
- Handles safe area insets for devices with home indicators
- Manages different full-screen views based on active tab

### MobileChatView (`mobile-chat-view.tsx`)
Full-screen chat interface that:
- Takes entire screen when chat tab is active
- Provides immersive messaging experience
- No overlay or dialog - true full-screen assistant

### MobileFoldersView (`mobile-folders-view.tsx`)
Full-screen navigation menu that:
- Slides in from left with smooth animation
- Covers entire screen when active
- Organized navigation items:
  - **Actions**: Processing, Upload
  - **Browse**: All, Pending, Due Now, Pinned, Flagged  
  - **Content**: Tasks, Notes, Bookmarks, Documents, Photos
  - **History**: History

## Utilities

### Mobile Navigation (`../lib/mobile-navigation.ts`)
Helper functions for:
- `getMobileTabFromPathname()`: Determines active tab from URL
- `shouldShowFolders()`: Checks if folders sheet should be open
- `getRouteForMobileTab()`: Gets navigation route for tab

## Usage

The mobile layout is automatically activated when `useIsMobile()` returns true (viewport < 768px). The `MainLayoutClient` component conditionally renders different full-screen views based on the active mobile tab.

### Mobile View States

1. **Home/Settings Tab**: Regular page content with bottom tab bar
2. **Chat Tab**: Full-screen `MobileChatView` - entire screen is the assistant
3. **Folders Tab**: Full-screen `MobileFoldersView` slides in from left

### Key Features

1. **True Mobile Native**: No desktop UI elements on mobile
2. **Maximum Screen Usage**: No top bar = +64px more content space
3. **Full-Screen Transitions**: Each tab provides immersive experience
4. **Touch-Friendly**: Large tap targets and proper spacing
5. **Safe Area Support**: Handles device notches and home indicators
6. **Notification Badges**: Due items count shown on Home tab
7. **Smooth Animations**: 300ms slide transitions for folders

### CSS Classes

Custom CSS utilities in `globals.css`:
- `.safe-area-pb`: Bottom safe area padding
- `.safe-area-pt`: Top safe area padding  
- `.mobile-viewport`: Dynamic viewport height (100vh/100dvh)

## Testing

Unit tests for navigation utilities can be found in `__tests__/mobile-navigation.test.ts`.

## Responsive Breakpoint

Mobile layout activates at < 768px viewport width, defined in `useIsMobile()` hook.

## Performance Benefits

- **Reduced Bundle Size**: No desktop components loaded on mobile
- **Better UX**: Native mobile patterns familiar to users
- **Improved Accessibility**: Larger touch targets, better navigation