@echo off
REM โหลด Gemma E4B สำหรับแชท local — ต้อง ctx 8192 (4096 จะ overflow เมื่อแชทยาว/summary ใหญ่)
REM รันไฟล์นี้ก่อนใช้แชทโหมด local (ดับเบิลคลิก หรือ: cmd /c load-local-model.cmd)
REM อ้างอิง: review/aurelia-review-gemma-e4b.md
echo Loading gemma-4-e4b-it-uncensored @ ctx 8192 ...
lms load gemma-4-e4b-it-uncensored --gpu max -c 8192 --parallel 1 -y
echo.
lms ps
