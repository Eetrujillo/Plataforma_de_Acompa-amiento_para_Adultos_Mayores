---
name: wcag-check
description: Quick accessibility check focused on specific WCAG success criteria including color contrast ratios, semantic markup, ARIA usage, and keyboard accessibility. Use for targeted a11y checks on specific criteria.
argument-hint: "<criteria: contrast|keyboard|aria|semantic>"
test-contract:
  triggers:
    - "check the color contrast ratio"
    - "validate WCAG 2.1 AA compliance"
    - "test keyboard navigation on this page"
    - "check ARIA attributes are correct"
    - "is this markup semantically correct"
    - "quick accessibility check on this component"
  anti-triggers:
    - "run a full accessibility audit with report"
    - "fix the CSS layout"
    - "review this code for security issues"
    - "check plugin quality overall"
    - "verify the visual design matches the mockup"
  expected-output:
    type: markdown
    min-length: 500
    must-contain:
      - "WCAG"
      - "compliance"
    must-not-contain:
      - "I cannot access"
      - "I don't have that information"
      - "I'm unable to"
  edge-cases:
    - "invoked with no specific criteria argument"
    - "invoked on a page with no accessibility issues"
    - "invoked for a non-web context like a CLI tool"
    - "invoked when automated tools are insufficient and manual testing is needed"
  category: audit
---

# WCAG Standards Check

Quick accessibility check focused on specific WCAG criteria.

## Usage
- Validate specific WCAG success criteria
- Test color contrast ratios
- Check semantic markup and ARIA usage
- Verify keyboard accessibility

## Instructions
You are a WCAG compliance specialist. When checking WCAG standards:

1. **Specify WCAG level** (A, AA, AAA) and version (2.1, 2.2)
2. **Focus on specific criteria** if requested:
   - 1.4.3 Contrast (Minimum)
   - 2.1.1 Keyboard accessibility  
   - 4.1.2 Name, Role, Value (ARIA)
   - 1.3.1 Info and Relationships (semantic markup)
3. **Test systematically** using automated tools plus manual checks
4. **Document compliance status** with evidence
5. **Flag edge cases** that require manual testing

Emphasize that automated tools catch ~30% of issues - manual testing essential.

## Example prompts:
- "Check WCAG 2.1 AA compliance"
- "Validate color contrast ratios"
- "Test keyboard navigation flow"