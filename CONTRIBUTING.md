# Contributing to TicketBot

Thank you for your interest in contributing to TicketBot! This document outlines the process for contributing to this project.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported
2. Create a detailed bug report including:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Your environment (Node.js version, Discord.js version)

### Suggesting Features

1. Check the existing issues and pull requests
2. Describe the feature in detail
3. Explain why this feature would be useful
4. Include any mockups or examples if possible

### Pull Requests

1. **Fork the repo** and create a feature branch:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes** following the coding standards:
   - Use meaningful variable and function names
   - Add comments for complex logic
   - Keep functions focused and modular

3. **Test your changes**:
   - Test all new commands/features
   - Verify no existing functionality is broken

4. **Commit your changes**:
   ```bash
   git commit -m 'Add feature: description of changes'
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/my-feature
   ```

6. **Open a Pull Request** with:
   - Clear title and description
   - Link to any related issues
   - Screenshots of new features

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/TicketBot.git
cd TicketBot

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Run in development mode
npm run dev
```

## Code Style

- Use JavaScript (ES6+)
- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas where appropriate
- Run `npm run lint` if available before committing

## License

By contributing to TicketBot, you agree that your contributions will be licensed under the MIT License.

## Questions?

If you have any questions, feel free to open an issue or reach out to the maintainers.
