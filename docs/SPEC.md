ALPHASTACK 7-DAY BUILDATHON

Task: Build an email application that uses phone numbers as email IDs (e.g., 9876543210@phonemail.com). Implement the features below. Prioritize the mobile client, then build the remaining components.

Account Creation Methods
- Toll-Free Number: Call and press "1" to create a PhoneMail account through an automated IVR, or send an SMS.
- Web Portal (Registration only): Just two fields (Phone Number and OTP). This portal is exclusively for account creation. On creation, the fields must reset for the next account creation.
- If no free OTP providers are available, use password-based authentication.
- Web Client
- Mobile Client
Once the account is created, users can start receiving emails.

Accessing Inbox
To access received emails, users can log in through any of the following methods.
- Mobile Client
- Web Client

SMS Notifications
Only for users who do not have the mobile application, i.e., users who registered via phone call, web portal, or web client. The user shall receive an SMS stating: "You have received an email from <Sender>. Subject: <Subject>."

#Implement SMS notifications and toll-free account creation using free trial accounts from providers such as Twilio or other gateways. If custom SMS template isn't available for trial users, send a pre available template. Use (Twilio-)provided international number for testing.

MOBILE CLIENT (Creative Designs Encouraged)
Login / Signup
The interface of every screen should follow WhatsApp's design language
- Screen 1: Language selection
- Screen 2: Terms & Conditions
- Screen 3: Phone number verification. Phone number is automatically detected and pre-filled. User can edit the number if required.
- Screen 4: OTP verification. OTP is automatically detected and verified. User is taken to their inbox.
- If no free OTP providers are available, use password-based authentication.
Request all required device permissions at the appropriate stage of onboarding, including phone number/SIM detection, SMS/OTP auto-detection, contacts access, etc.
Home (Refer Spike Mail)
- Two ways to compose a) Traditional view: use the compose button in the bottom-right corner b) Chat view: search a phone number to open a conversation and start typing
- No separate Inbox or Sent folders. All emails are organized into chats/conversations.
- A full-width search bar at the top.
- Filter chips below the search bar: All, Unread, Attachments, and Favorites.
- A top-left menu with Home (Inbox and Sent are unified), Drafts, Spam, and Trash.
- A profile icon in the top-right providing access to account settings. Manage Alias IDs, language, personal details, profile picture, and more.
Inside a chat/conversation (Refer Spike Mail)
- A compact Subject field appears above the message box.
- All emails from the same sender stay within the same chat/conversation.
- New emails display the subject at the top. Reply emails are linked to the original email (swipe right to tag the original message).
- When replying, the Subject field is hidden. For new emails, it remains visible.
- Each message can be replied to only once.
- If an email is too long, tap it to open it in the traditional view.
- Inside a chat/conversation, an option should be provided to compose a new email in the traditional view (utilize the space occupied by WhatsApp's camera tab). The To field should be pre-filled and locked. To reply in the traditional view, swipe right on a message and select the traditional view option. Alternatively, tap the email to open it in the traditional view, then use the Reply option at the bottom.
- Inside a chat/conversation, new recipients cannot be added to the To or CC fields. In the traditional view, these fields remain locked. To add multiple recipients, compose a new email from the Home screen.
- Adding two or more recipients using the Compose option on the Home screen creates a new group chat. Future emails to an individual recipient continue in their original one-to-one chat, not the group chat.
Summary of Key Features
- Automatic phone number & OTP detection (password-based if OTP not available)
- Emails organised as chats
- Manage alias IDs in settings

WEB CLIENT (Creative Designs Encouraged)
Login / Signup
A single screen with the phone number, OTP and one Next button. Above the button, display "By signing up, you agree to the Terms of Service", with Terms of Service hyperlinked.
Home Screen and Other Features
The web interface should be similar to Gmail. There is no need for a conversation/chat-style interface here. Profile and Settings must be provided.
Dockerize everything.
Software must be up and running at: docker compose up -d
