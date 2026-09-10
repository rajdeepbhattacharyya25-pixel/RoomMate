---
description: Adds the standard corporate license header to new source files.
---

# License Header Adder

This workflow ensures that all new source files have the correct copyright header.

## Instructions

1. **Use the following template**:

   ```
   /*
    * Copyright (c) 2026 YOUR_COMPANY_NAME LLC.
    * All rights reserved.
    * This code is proprietary and confidential.
    */
   ```

2. **Apply to File**: When creating a new file, prepend this exact content.
3. **Adapt Syntax**:
   - For C-style languages (Java, TS), keep the `/* */` block.
   - For Python/Shell, convert to `#` comments.
