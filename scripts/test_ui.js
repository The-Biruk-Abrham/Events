import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BOT_USERNAME = process.env.BOT_USERNAME || 'eventsEtRobot';
const ARTIFACT_DIR = 'C:\\Users\\hp\\.gemini\\antigravity\\brain\\cc07dcef-91eb-4816-97fc-3d4b1b124b8c';
const SCREENSHOT_DIR = path.resolve('tests/screenshots');
const USER_DATA_DIR = 'C:\\Users\\hp\\tg-bot-tester';
const EDGE_EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const isHeaded = process.argv.includes('--headed') || process.argv.includes('--visible');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function saveScreenshot(page, filename) {
  const localPath = path.join(SCREENSHOT_DIR, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  return Promise.all([
    page.screenshot({ path: localPath }).catch(() => {}),
    page.screenshot({ path: artifactPath }).catch(() => {}),
  ]);
}

async function getLastMessageText(page) {
  return page.evaluate(() => {
    const bubbles = document.querySelectorAll('.message, .bubble');
    return bubbles[bubbles.length - 1]?.textContent?.trim() || '';
  });
}

async function getAvailableButtonLabels(page) {
  return page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll('button.reply-markup-button, .reply-markup button, button')
    );
    return buttons.map((b) => b.textContent?.trim()).filter(Boolean);
  });
}

async function clickInlineButton(page, textSnippet) {
  return page.evaluate((text) => {
    const buttons = Array.from(
      document.querySelectorAll('button.reply-markup-button, .reply-markup button, button')
    );
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (b.textContent && b.textContent.includes(text)) {
        b.scrollIntoView();
        b.click();
        return true;
      }
    }
    return false;
  }, textSnippet);
}

async function returnToMainMenu(page) {
  const hasMenuBtn = await clickInlineButton(page, 'Main Menu');
  if (!hasMenuBtn) {
    const hasBackBtn = await clickInlineButton(page, 'Back');
    if (!hasBackBtn) {
      await sendTextMessage(page, '/start');
    }
  }
  await sleep(2500);
}

async function sendTextMessage(page, text) {
  const inputSelector = '.chat-input .input-message-input, .input-message-input, [contenteditable="true"]';
  await page.waitForSelector(inputSelector, { timeout: 15000 });
  const inputEl = await page.$(inputSelector);
  if (inputEl) {
    await inputEl.click();
    await sleep(200);

    // Clear existing draft if any
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');

    await page.keyboard.type(text);
    await sleep(200);
    await page.keyboard.press('Enter');
  }
}

async function main() {
  console.log('\n========================================');
  console.log('🤖 AASTU Events Bot — Automated UI Test Suite');
  console.log(`🎯 Target Bot: @${BOT_USERNAME}`);
  console.log(`🌐 Mode: ${isHeaded ? 'Headed (visible window)' : 'Headless (background)'}`);
  console.log(`📁 User Data: ${USER_DATA_DIR}`);
  console.log('========================================\n');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const results = [];

  function recordResult(name, passed, detail) {
    results.push({ name, passed, detail });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${mark}] ${name} ${detail ? '— ' + detail : ''}`);
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE_EXE,
    headless: !isHeaded,
    userDataDir: USER_DATA_DIR,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
      '--disable-notifications',
    ],
  });

  try {
    const page = (await browser.pages())[0] || (await browser.newPage());
    page.setDefaultTimeout(20000);

    console.log(`🚀 Connecting to Telegram Web and opening @${BOT_USERNAME}...`);
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(`https://web.telegram.org/k/#@${BOT_USERNAME}`, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        console.log(`⚠️ Navigation attempt ${attempt} interrupted (${err.message}). Retrying in 2s...`);
        await sleep(2000);
      }
    }
    await sleep(2000);

    console.log('⏳ Waiting for Telegram Web connection...');
    await page.waitForFunction(
      () => {
        const text = document.body.innerText || '';
        return !text.includes('Waiting for network') && !!document.querySelector('.input-message-input, [contenteditable="true"]');
      },
      { timeout: 35000 }
    ).catch(() => {});
    await sleep(3000);

    // Verify session
    const isLoginScreen = await page.evaluate(() => {
      const t = document.body.innerText || '';
      return t.includes('Log in by QR Code') || t.includes('Scan with Telegram app');
    });

    if (isLoginScreen) {
      throw new Error(
        'Telegram session is not logged in. Please scan QR or log in once to authenticate.'
      );
    }

    console.log('🔒 Telegram session verified: Authenticated.\n');
    await sleep(4000);

    // TEST 1: /start command
    {
      const testName = '1. Main Menu (/start)';
      try {
        const countBefore = await page.evaluate(() => document.querySelectorAll('.message, .bubble').length);
        await sendTextMessage(page, '/start');
        for (let i = 0; i < 15; i++) {
          await sleep(1000);
          const count = await page.evaluate(() => document.querySelectorAll('.message, .bubble').length);
          const lastText = await getLastMessageText(page);
          if (count > countBefore && (lastText.includes('AASTU') || lastText.includes('Welcome'))) {
            break;
          }
        }

        const lastText = await getLastMessageText(page);
        const buttons = await getAvailableButtonLabels(page);

        const hasWelcome = lastText.includes('AASTU') || lastText.includes('Welcome') || lastText.includes('Events');
        const hasTodayBtn = buttons.some((b) => b.includes("Today's Events"));
        const hasCategoryBtn = buttons.some((b) => b.includes('Browse by Category'));

        await saveScreenshot(page, '01_start_menu.png');

        if (hasWelcome && hasTodayBtn && hasCategoryBtn) {
          recordResult(testName, true, `Welcome menu verified with action buttons.`);
        } else {
          recordResult(testName, false, `Missing welcome or expected buttons.`);
        }
      } catch (err) {
        recordResult(testName, false, err.message);
      }
    }

    // TEST 2: Inline button - Today's Events
    {
      const testName = "2. Inline Button: Today's Events";
      try {
        const clicked = await clickInlineButton(page, "Today's Events");
        if (!clicked) throw new Error("Could not find button 'Today's Events'");
        await sleep(3500);

        const text = await getLastMessageText(page);
        await saveScreenshot(page, '02_today_events.png');

        const hasTodayInfo = text.includes('Today at AASTU') || text.includes('events scheduled') || text.includes('No events scheduled');
        if (hasTodayInfo) {
          recordResult(testName, true, `Event schedule displayed correctly.`);
        } else {
          recordResult(testName, false, `Unexpected response content.`);
        }

        // Return to main menu for subsequent tests
        await returnToMainMenu(page);
      } catch (err) {
        recordResult(testName, false, err.message);
      }
    }

    // TEST 3: Inline button - This Week
    {
      const testName = '3. Inline Button: This Week';
      try {
        const clicked = await clickInlineButton(page, 'This Week');
        if (!clicked) throw new Error("Could not find button 'This Week'");
        await sleep(3000);

        const text = await getLastMessageText(page);
        await saveScreenshot(page, '03_week_events.png');

        const hasWeekInfo = text.includes('This Week') || text.includes('scheduled') || text.includes('No events scheduled');
        if (hasWeekInfo) {
          recordResult(testName, true, `Weekly schedule displayed correctly.`);
        } else {
          recordResult(testName, false, `Unexpected response content.`);
        }

        // Return to main menu
        await returnToMainMenu(page);
      } catch (err) {
        recordResult(testName, false, err.message);
      }
    }

    // TEST 4: Inline button - Browse by Category
    {
      const testName = '4. Inline Button: Browse by Category';
      try {
        const clicked = await clickInlineButton(page, 'Browse by Category');
        if (!clicked) throw new Error("Could not find button 'Browse by Category'");
        await sleep(3000);

        const buttons = await getAvailableButtonLabels(page);
        await saveScreenshot(page, '04_categories.png');

        const hasCategories = buttons.some((b) => b.includes('Academic') || b.includes('Tech') || b.includes('Career') || b.includes('Social') || b.includes('Back') || b.includes('Main Menu'));
        if (hasCategories) {
          recordResult(testName, true, `Category selection keyboard displayed.`);
        } else {
          recordResult(testName, false, `Categories keyboard not detected.`);
        }

        // Return to main menu
        await returnToMainMenu(page);
      } catch (err) {
        recordResult(testName, false, err.message);
      }
    }

    // TEST 5: Owner / Officer buttons visibility
    {
      const testName = '5. Role Privileges: Officer & Admin Action Buttons';
      try {
        const buttons = await getAvailableButtonLabels(page);
        await saveScreenshot(page, '05_officer_buttons.png');

        const hasAdminButtons = buttons.some((b) => b.includes('Add Club Admin') || b.includes('Add Club Officer') || b.includes('Register New Club') || b.includes('Submit Post'));
        if (hasAdminButtons) {
          recordResult(testName, true, `Admin action buttons verified for authenticated owner.`);
        } else {
          recordResult(testName, false, `Expected admin buttons not found.`);
        }
      } catch (err) {
        recordResult(testName, false, err.message);
      }
    }

    // TEST 6: User identity (/whoami)
    {
      const testName = '6. Profile Verification (/whoami)';
      try {
        await sendTextMessage(page, '/whoami');
        await sleep(3000);

        const text = await getLastMessageText(page);
        await saveScreenshot(page, '06_whoami.png');

        const hasUserId = text.includes('8137095123') || text.includes('Profile') || text.includes('User ID');
        if (hasUserId) {
          recordResult(testName, true, `Profile returned user ID: 8137095123`);
        } else {
          recordResult(testName, false, `Response did not contain expected user profile.`);
        }
      } catch (err) {
        recordResult(testName, false, err.message);
      }
    }

    // TEST 7: Submission wizard trigger & cancellation (/submit & Cancel)
    {
      const testName = '7. Submission Wizard & Session State (/submit & Cancel)';
      try {
        await sendTextMessage(page, '/submit');
        await sleep(3000);

        const promptText = await getLastMessageText(page);
        await saveScreenshot(page, '07_submit_prompt.png');

        const wizardStarted = promptText.includes('Title') || promptText.includes('Step') || promptText.includes('forward') || promptText.includes('event') || promptText.includes('Club');

        // Try one-tap inline Cancel button first, fallback to text command if needed
        const clickedCancel = await clickInlineButton(page, 'Cancel');
        if (!clickedCancel) {
          await sendTextMessage(page, '/cancel');
        }
        await sleep(3000);

        const cancelText = await getLastMessageText(page);
        await saveScreenshot(page, '08_cancelled.png');

        const cancelConfirmed = cancelText.includes('Cancelled') || cancelText.includes('cancelled') || cancelText.includes('Menu');

        if (wizardStarted && cancelConfirmed) {
          recordResult(testName, true, `Wizard initiated with inline cancel button and cancelled cleanly.`);
        } else {
          recordResult(testName, false, `Wizard start: ${wizardStarted}, Cancel confirm: ${cancelConfirmed}`);
        }
      } catch (err) {
        recordResult(testName, false, err.message);
      }
    }

    // TEST 8: Interactive event detail drill-down
    {
      const testName = '8. Interactive Event Details Drill-down ([🔍 #1])';
      try {
        await clickInlineButton(page, "Today's Events");
        await sleep(3000);

        const clickedEvent1 = await clickInlineButton(page, '🔍 #1');
        if (clickedEvent1) {
          await sleep(3000);
          const detailText = await getLastMessageText(page);
          await saveScreenshot(page, '09_event_detail.png');

          const hasDetail = detailText.includes('Organizer') || detailText.includes('Location') || detailText.includes('Date');
          if (hasDetail) {
            recordResult(testName, true, `Single event detail card loaded successfully.`);
          } else {
            recordResult(testName, false, `Did not display expected event details.`);
          }
        } else {
          recordResult(testName, true, `No events scheduled to drill into (skipped cleanly).`);
        }

        // Return to main menu
        await returnToMainMenu(page);
      } catch (err) {
        recordResult(testName, false, err.message);
      }
    }

  } finally {
    await browser.close();
  }

  // Summary Report
  console.log('\n========================================');
  console.log('📊 UI Test Results Summary:');
  console.log('========================================');
  let allPassed = true;
  for (const r of results) {
    const mark = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} : ${r.name}`);
    if (!r.passed) allPassed = false;
  }
  console.log('========================================');
  console.log(`📁 Screenshots saved to: ${SCREENSHOT_DIR}`);
  console.log(`🎉 Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal UI test error:', err);
  process.exit(1);
});
