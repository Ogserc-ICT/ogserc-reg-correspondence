
Private Sub Workbook_Open()
    On Error Resume Next
    Application.EnableEvents = True
    ThisWorkbook.Worksheets("Registry Desk").Activate
End Sub

Private Sub Workbook_SheetSelectionChange(ByVal Sh As Object, ByVal Target As Range)
    On Error GoTo Quit
    RegistryDesk.HandleClick Sh, Target
    Exit Sub
Quit:
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    MsgBox "Something went wrong: " & Err.Description, vbExclamation, "OGSERC Registry"
End Sub
