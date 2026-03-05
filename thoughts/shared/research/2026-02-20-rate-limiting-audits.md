# Research: Rate Limiting for Audit Requests

## Overview
This research documents the current audit system implementation and explores rate limiting solutions to prevent abuse of audit functionality. The audit system processes pricing page analysis requests using LLM services with existing concurrency controls but no user-specific rate limiting.

## Current Audit System Architecture

### Core Components
- **Entry Point**: `src/actions/analyzePricingPage.ts:11` - `analyzePricingPageAction()` server action
- **Use Case**: `src/application/usecases/ParsePricingPageUseCase.ts:43` - Main workflow orchestrator
- **LLM Service**: `src/infrastructure/adapters/LlmServiceImpl.ts` - Handles API calls with concurrency limiting

### Request Flow
1. UI calls server action with URL and personas (`src/ui/hooks/useAnalysisFlow.ts:46`)
2. Server action creates abort controller and instantiates services
3. Use case executes browser scouting and parallel persona analysis
4. Results stream back via progress callbacks

### Existing Controls
- **Global Concurrency**: `src/infrastructure/adapters/LlmServiceImpl.ts:25` - pLimit(20) for LLM requests
- **Persona Concurrency**: `src/application/usecases/ParsePricingPageUseCase.ts:225` - Max 2 concurrent personas
- **Retry Logic**: `src/infrastructure/adapters/LlmServiceImpl.ts:71-90` - Exponential backoff for 429/5xx errors
- **Request Cancellation**: `src/infrastructure/RequestCancellationManager.ts:19-28` - AbortController-based cancellation

### Current Limitations
- No per-user or per-IP rate limiting
- Global concurrency limits don't protect against single user abuse
- Retry logic handles provider rate limits but not application-level throttling
- No configurable limits for audit request frequency

## Existing Patterns in Codebase

### Server Actions Pattern
- Uses "use server" directive for Next.js server actions
- Streaming responses with `createStreamableValue`
- Integrated abort signal handling
- Try/catch with discriminated union return types

### Concurrency Control Pattern
- Static limiter shared across service instances
- Applied to both streaming and completion calls
- Prevents overwhelming LLM providers

### Error Handling Pattern
- Consistent try/catch in all server actions
- Type guards for error instanceof checks
- User-friendly error messages with debug logging

## Rate Limiting Best Practices

### Recommended Libraries
- **express-rate-limit**: Popular middleware for Express.js applications
  - Fixed window algorithm by default
  - Configurable `windowMs` and `limit` parameters
  - Supports Redis for distributed environments
  - Adds standard `RateLimit-*` headers

- **rate-limiter-flexible**: Flexible library with multiple algorithms
  - Token bucket, sliding window counter, fixed window
  - Points-based configuration
  - Redis integration for distributed limiting

### Algorithms to Consider
- **Token Bucket**: Allows bursts while enforcing average rate
  - Tokens added at fixed rate, consumed per request
  - Good for handling traffic spikes

- **Sliding Window Counter**: Groups requests over time windows
  - More accurate than fixed windows
  - Better for per-user limits

### Implementation Approaches
- **IP-based Limiting**: Default for anonymous users
- **User-based Limiting**: When authenticated
- **Middleware Integration**: Apply before request processing
- **HTTP 429 Responses**: With `Retry-After` headers

## Historical Context
- Existing research documents focus on pricing audit performance and bugs
- No previous work on rate limiting specifically
- Related issues with throttling and stack overflow in audit processing
- Branch `feat/improve-pdf-exports` suggests ongoing feature work

## Implementation Opportunities
- Apply rate limiting at server action level before LLM processing
- Leverage existing `RequestCancellationManager` patterns
- Use Redis store for distributed rate limiting
- Configure limits based on user tiers or API keys

## Success Criteria
- Prevent abuse while allowing legitimate usage
- Minimal performance impact on valid requests
- Clear error responses with retry guidance
- Configurable limits for different user types
- Integration with existing concurrency controls