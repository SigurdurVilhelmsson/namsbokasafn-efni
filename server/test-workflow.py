#!/usr/bin/env python3
"""
Automated workflow UI test using Playwright.
Tests the translation pipeline workflow from start to download.
"""

from playwright.sync_api import sync_playwright
import time

BASE_URL = "http://localhost:3000"

def test_workflow():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("1. Loading workflow page...")
        page.goto(f"{BASE_URL}/workflow")
        page.wait_for_load_state('networkidle')

        # Take screenshot of initial state
        page.screenshot(path='/tmp/workflow-01-initial.png', full_page=True)
        print("   Screenshot: /tmp/workflow-01-initial.png")

        # Check if login is required
        user_info = page.locator('#user-info').inner_html()
        if 'Innskráning' in user_info:
            print("   ERROR: Not logged in - cannot test workflow")
            print("   Need to mock auth or use test credentials")
            browser.close()
            return False

        print("2. Selecting book...")
        book_select = page.locator('#book-select')
        page.wait_for_function("document.querySelector('#book-select option[value]')")
        book_select.select_option('chemistry-2e')
        time.sleep(0.5)

        print("3. Selecting chapter...")
        chapter_select = page.locator('#chapter-select')
        page.wait_for_selector('#chapter-select:not([disabled])')
        chapter_select.select_option('1')
        time.sleep(0.5)

        # Verify chapter info shows
        chapter_info = page.locator('#chapter-info')
        if chapter_info.is_visible():
            module_count = page.locator('#module-count').inner_text()
            print(f"   Chapter has {module_count} modules")

        page.screenshot(path='/tmp/workflow-02-chapter-selected.png', full_page=True)
        print("   Screenshot: /tmp/workflow-02-chapter-selected.png")

        print("4. Starting workflow...")
        submit_btn = page.locator('#submit-btn')
        submit_btn.click()

        # Wait for processing (may take a while)
        print("   Waiting for processing...")
        page.wait_for_selector('#workflow-detail:not([style*="display: none"])', timeout=120000)
        time.sleep(1)

        page.screenshot(path='/tmp/workflow-03-processing-done.png', full_page=True)
        print("   Screenshot: /tmp/workflow-03-processing-done.png")

        # Check workflow detail content
        detail_title = page.locator('#detail-title').inner_text()
        print(f"   Workflow: {detail_title}")

        step_content = page.locator('#step-content').inner_html()
        print(f"   Step content preview: {step_content[:200]}...")

        # Check for errors
        if 'undefined' in step_content.lower():
            print("   ERROR: Found 'undefined' in step content!")

        if 'Skref 0' in step_content:
            print("   ERROR: Step index is 0 - likely a bug!")

        # Check for download button
        download_btn = page.locator('#download-proceed')
        if download_btn.is_visible():
            print("5. Found download button, clicking...")
            download_btn.click()
            time.sleep(2)

            page.screenshot(path='/tmp/workflow-04-after-download.png', full_page=True)
            print("   Screenshot: /tmp/workflow-04-after-download.png")

            # Check new step content
            step_content_after = page.locator('#step-content').inner_html()
            print(f"   New step content preview: {step_content_after[:200]}...")

            if 'undefined' in step_content_after.lower():
                print("   ERROR: Found 'undefined' after download!")
            if 'Vélþýðing' in step_content_after:
                print("   SUCCESS: Now showing MT upload step")

        # Check for proceed button
        proceed_btn = page.locator('#proceed-btn')
        if proceed_btn.is_visible():
            print("6. Found 'Halda áfram' button")

            # Create a test file to upload
            import tempfile
            with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as f:
                f.write("# Test translated content\n\nThis is a test.")
                test_file = f.name

            # Upload test file
            print("7. Uploading test file...")
            file_input = page.locator('#upload-file')
            file_input.set_input_files(test_file)
            page.locator('#upload-form button[type="submit"]').click()
            time.sleep(2)

            page.screenshot(path='/tmp/workflow-06-after-upload.png', full_page=True)
            print("   Screenshot: /tmp/workflow-06-after-upload.png")

            # Click proceed button
            print("8. Clicking proceed button...")
            proceed_btn = page.locator('#proceed-btn')
            if proceed_btn.is_visible():
                proceed_btn.click()
                time.sleep(2)

                page.screenshot(path='/tmp/workflow-07-after-proceed.png', full_page=True)
                print("   Screenshot: /tmp/workflow-07-after-proceed.png")

                # Check if we advanced to next step
                step_content_final = page.locator('#step-content').inner_html()
                print(f"   Final step content preview: {step_content_final[:200]}...")

                if 'Skref 3' in step_content_final or 'Matecat' in step_content_final:
                    print("   SUCCESS: Advanced to step 3!")
                elif 'undefined' in step_content_final.lower():
                    print("   ERROR: Found 'undefined' after proceed!")

            # Cleanup temp file
            import os
            os.unlink(test_file)

        # Check active workflows list
        active_workflows = page.locator('#active-workflows').inner_html()
        if 'Engin virk' in active_workflows:
            print("   WARNING: Active workflows list is empty")
        else:
            print("   Active workflows list has content")

        page.screenshot(path='/tmp/workflow-08-final.png', full_page=True)
        print("   Screenshot: /tmp/workflow-08-final.png")

        browser.close()
        print("\nTest completed!")
        return True

if __name__ == '__main__':
    test_workflow()
