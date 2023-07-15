# Example GitHub Application in GitHub Actions

This repository demonstrates a minimal proof of concept
[GitHub Application](https://docs.github.com/en/apps) which runs inside a
[GitHub Action](https://docs.github.com/en/actions). It operates a customized
[Check Run](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
on this repository to demonstrate that advanced reporting and even commenting is
possible from within a GitHub Action.

See the `.github` folder for the internal details. The Pull Request Tab will
contain an example pull request which fails the check run.
