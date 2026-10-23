// FUNCTION 1805e1ed0

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_1805e1ed0(undefined8 *param_1,int *param_2)

{
  int iVar1;
  int *piVar2;
  ulonglong uVar3;
  undefined8 *puVar4;
  ushort *puVar5;
  undefined1 auStack_b8 [32];
  ushort uStack_98;
  ushort auStack_96 [7];
  int iStack_88;
  int iStack_84;
  undefined8 uStack_80;
  longlong lStack_78;
  longlong lStack_70;
  undefined1 uStack_40;
  ulonglong uStack_38;
  
  uStack_38 = _DAT_181f8ca80 ^ (ulonglong)auStack_b8;
  mbstowcs(&iStack_88,&UNK_181cfa524,5);
  puVar4 = param_1;
  if (7 < (ulonglong)param_1[3]) {
    puVar4 = (undefined8 *)*param_1;
  }
  lStack_78 = _wfopen(puVar4,&iStack_88);
  lStack_70 = 0;
  if (lStack_78 == 0) {
    piVar2 = (int *)_errno();
    iStack_88 = *piVar2;
    uStack_80 = 0x181f906d0;
    *param_2 = iStack_88;
    param_2[1] = iStack_84;
    param_2[2] = -0x7e06f930;
    param_2[3] = 1;
  }
  uStack_40 = 1;
  if ((*(longlong *)(*(longlong *)(param_2 + 2) + 8) != _DAT_181f906d8) || (*param_2 != 0))
  goto LAB_1805e20bb;
  puVar5 = &uStack_98;
  if (lStack_78 == 0) {
    iStack_88 = 0x16;
    uStack_80 = 0x181f906c0;
    *param_2 = 0x16;
    param_2[1] = iStack_84;
    param_2[2] = -0x7e06f940;
    param_2[3] = 1;
LAB_1805e200d:
    if ((*(longlong *)(*(longlong *)(param_2 + 2) + 8) == _DAT_181f906d8) && (*param_2 == 0)) {
      iStack_88 = 0x7a;
      uStack_80 = 0x181f906c0;
      *param_2 = 0x7a;
      param_2[1] = iStack_84;
      param_2[2] = -0x7e06f940;
      param_2[3] = 1;
    }
  }
  else {
    uVar3 = fread(&uStack_98,1,2);
    lStack_70 = lStack_70 + uVar3;
    if ((uVar3 != 2) && (iVar1 = ferror(lStack_78), iVar1 != 0)) {
      iStack_88 = 5;
      uStack_80 = 0x181f906c0;
      *param_2 = 5;
      param_2[1] = iStack_84;
      param_2[2] = -0x7e06f940;
      param_2[3] = 1;
    }
    if (uVar3 < 2) goto LAB_1805e200d;
  }
  if ((*(longlong *)(*(longlong *)(param_2 + 2) + 8) == _DAT_181f906d8) && (*param_2 == 0)) {
    for (; puVar5 != auStack_96; puVar5 = puVar5 + 1) {
      *puVar5 = *puVar5 >> 8 | *puVar5 << 8;
    }
  }
  if ((*(longlong *)(*(longlong *)(param_2 + 2) + 8) == _DAT_181f906d8) && (*param_2 == 0)) {
    if (uStack_98 == 1) {
      FUN_1805e20f0(param_1,&lStack_78,param_2);
    }
    else {
      iStack_88 = 0x87;
      uStack_80 = 0x181f906c0;
      *param_2 = 0x87;
      param_2[1] = iStack_84;
      param_2[2] = -0x7e06f940;
      param_2[3] = 1;
    }
  }
LAB_1805e20bb:
  FUN_18016a3c0(&lStack_78);
  FUN_180f9eb40(uStack_38 ^ (ulonglong)auStack_b8);
  return;
}


