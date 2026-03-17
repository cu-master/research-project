When implement new feature:

- git checkout -b feat/my-new-feature (Create and switch to the new branch).

💻 WRITE YOUR CODE (This is where you open VS Code, edit your files, and save them).

- git add . (Stage the changes you just made).

- git commit -m "feat: add user login" (Save the snapshot of your work).

- git checkout main (Go back to the "stable" branch).

- git pull origin main (Ensure your local main is up to date with GitHub).

- git merge feat/my-new-feature (Bring your new code into main).

- git push origin main (Send the finished feature to GitHub).