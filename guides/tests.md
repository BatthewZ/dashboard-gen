# Testing

When writing tests, prioritize integration testing over heavily mocked unit tests:

- Test real interactions between components rather than isolated units with mocks
- Only mock external dependencies (APIs, databases) when absolutely necessary
- Test the actual integration points where bugs commonly occur
- If you must mock, mock at the boundaries (external services) not internal components
- Write tests that exercise the same code paths users will actually use

**IMPORTANT:** NEVER USE `... || true` IN ASSERTIONS. IT HIDES THE SIGNAL AND MAKES THE TEST REDUNDANT AND I WILL FIGHT YOU IF YOU DO IT.

NEVER WRAP ASSERTIONS IN `if (isVisible)` OR SIMILAR GUARDS. It hides the signal and makes the test redundant. AND I WILL FIGHT YOU IF YOU DO IT.

These are shallow assertions that prevent good testing. What are some other things that might make tests ineffective? Consider them to avoid them. We need our tests to be as helpful and accurate as possible.

Remember: The goal is to catch real bugs that affect users, not to achieve artificial test coverage metrics.
