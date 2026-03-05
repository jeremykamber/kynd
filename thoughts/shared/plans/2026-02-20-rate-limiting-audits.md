# Implementation Plan: Rate Limiting for Audit Requests

## Overview
Implement rate limiting to prevent abuse of audit functionality while maintaining performance for legitimate users. Based on research in `thoughts/shared/research/2026-02-20-rate-limiting-audits.md`, we'll use `express-rate-limit` with sliding window algorithm, integrated into Next.js server actions.

## Success Criteria (Overall)
- Users cannot make more than 5 audit requests per minute
- HTTP 429 responses with proper retry headers
- No performance impact >5% on valid requests
- Configurable limits via environment variables
- Integration with existing concurrency controls

## Phase 1: Library Selection and Integration
**Objective**: Choose and integrate rate limiting library following existing patterns.

**Steps**:
1. Install `express-rate-limit` (v7.x for Next.js compatibility)
2. Set up basic middleware configuration
3. Integrate into `src/actions/analyzePricingPage.ts` entry point

**Success Criteria**:
- Library installed without dependency conflicts
- Middleware applied before LLM processing
- Basic limit of 10 requests/minute functional

**Verification**:
- npm install succeeds
- TypeScript compilation passes
- Manual testing shows 429 after limit exceeded

## Phase 2: Rate Limiting Logic Implementation
**Objective**: Implement per-user/IP limiting with proper error handling.

**Steps**:
1. Configure sliding window algorithm (1-minute windows)
2. Set limit to 5 audits per minute per IP
3. Add custom error messages and Retry-After headers
4. Integrate with existing error handling patterns

**Success Criteria**:
- Requests beyond limit return 429 status
- Response includes Retry-After header
- Normal requests unaffected
- Logs rate limit events for monitoring

**Verification**:
- Simulate 6 requests/minute; confirm throttling
- Check response format matches existing error patterns
- Performance benchmarks show <2% overhead

## Phase 3: Configuration and Tuning
**Objective**: Make limits configurable and add monitoring.

**Steps**:
1. Add environment variables:
   - `AUDIT_RATE_LIMIT_WINDOW_MS=60000`
   - `AUDIT_RATE_LIMIT_MAX=5`
2. Implement IP-based key generation
3. Add debug logging for rate limit hits

**Success Criteria**:
- Limits adjustable without code changes
- Environment variables documented
- Monitoring logs available in production

**Verification**:
- Change env vars; restart; verify limits update
- Check application logs for rate limit events
- Configuration documented in README

## Phase 4: Testing and Validation
**Objective**: Comprehensive testing across scenarios.

**Steps**:
1. Unit tests for rate limiting middleware
2. Integration tests with concurrent requests
3. Load testing for performance impact
4. Regression testing for audit workflows

**Success Criteria**:
- Test coverage >90% for rate limiting code
- All existing audit functionality preserved
- No breaking changes to API contracts

**Verification**:
- Test suite passes with new tests
- Load test shows <5% performance degradation
- Manual QA confirms audit flow unchanged

## Phase 5: Deployment and Monitoring
**Objective**: Safe deployment with monitoring capabilities.

**Steps**:
1. Deploy to staging environment
2. Monitor error rates and rate limit metrics
3. Gradual production rollout
4. Update user documentation

**Success Criteria**:
- No increase in error rates post-deployment
- Rate limiting effectively prevents abuse
- User feedback indicates improved reliability

**Verification**:
- Staging monitoring shows stable metrics
- Production deployment with feature flag control
- Post-deployment user reports monitored

## Risk Assessment
- **High**: Breaking existing audit workflows - mitigated by comprehensive testing
- **Medium**: Performance impact - mitigated by load testing and monitoring
- **Low**: Configuration errors - mitigated by environment variable validation

## Dependencies
- `express-rate-limit` library
- Redis store (future enhancement for distributed limiting)
- Environment variable configuration
- Existing error handling patterns

## Timeline Estimate
- Phase 1: 1-2 hours
- Phase 2: 2-3 hours  
- Phase 3: 1 hour
- Phase 4: 2-3 hours
- Phase 5: 1-2 hours
- Total: 7-11 hours