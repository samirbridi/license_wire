// FUNCTION 1805e45b0

/* WARNING: Removing unreachable block (ram,0x0001805e468d) */
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_1805e45b0(undefined8 *param_1,undefined8 *param_2,undefined8 param_3)

{
  undefined1 auStack_a8 [32];
  undefined4 uStack_88;
  undefined8 uStack_80;
  undefined8 uStack_50;
  undefined8 uStack_48;
  undefined8 uStack_40;
  undefined4 uStack_38;
  undefined4 uStack_34;
  undefined4 uStack_30;
  undefined4 uStack_2c;
  undefined4 uStack_28;
  undefined4 uStack_24;
  undefined4 uStack_20;
  undefined4 uStack_1c;
  ulonglong uStack_18;
  
  uStack_18 = _DAT_181f8ca80 ^ (ulonglong)auStack_a8;
  uStack_50 = *param_1;
  *param_1 = 0;
  uStack_48 = param_1[1];
  param_1[1] = 0;
  uStack_40 = *param_2;
  func_0x000180fa0258(&uStack_38,param_3,0x20);
  FUN_18016a3c0(param_1);
  *param_1 = uStack_50;
  uStack_50 = 0;
  param_1[1] = uStack_48;
  uStack_48 = 0;
  param_1[2] = uStack_40;
  *(undefined4 *)(param_1 + 3) = uStack_38;
  *(undefined4 *)((longlong)param_1 + 0x1c) = uStack_34;
  *(undefined4 *)(param_1 + 4) = uStack_30;
  *(undefined4 *)((longlong)param_1 + 0x24) = uStack_2c;
  *(undefined4 *)(param_1 + 5) = uStack_28;
  *(undefined4 *)((longlong)param_1 + 0x2c) = uStack_24;
  *(undefined4 *)(param_1 + 6) = uStack_20;
  *(undefined4 *)((longlong)param_1 + 0x34) = uStack_1c;
  *(undefined1 *)(param_1 + 7) = 2;
  uStack_88 = 0;
  uStack_80 = 0x181f906d0;
  FUN_180f9eb40(uStack_18 ^ (ulonglong)auStack_a8);
  return;
}


// FUNCTION 1805e4840

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_1805e4840(longlong *param_1,undefined8 *param_2,int *param_3)

{
  ulonglong uVar1;
  int iVar2;
  ulonglong uVar3;
  undefined8 uStack_28;
  undefined8 uStack_20;
  
  if ((char)param_1[7] == '\x01') {
    uVar1 = param_2[1];
    if (*param_1 == 0) {
      uStack_28 = CONCAT44(uStack_28._4_4_,0x16);
      uVar3 = 0;
      *(undefined8 *)param_3 = uStack_28;
      param_3[2] = -0x7e06f940;
      param_3[3] = 1;
    }
    else {
      uVar3 = fread(*param_2,1,uVar1);
      param_1[1] = param_1[1] + uVar3;
      if (uVar3 != uVar1) {
        iVar2 = ferror(*param_1);
        if (iVar2 != 0) {
          uStack_28 = CONCAT44(uStack_28._4_4_,5);
          *(undefined8 *)param_3 = uStack_28;
          param_3[2] = -0x7e06f940;
          param_3[3] = 1;
        }
      }
    }
  }
  else {
    uStack_28 = *param_2;
    uStack_20 = param_2[1];
    uVar3 = FUN_1805e6c00(param_1,&uStack_28);
  }
  if (((uVar3 < (ulonglong)param_2[1]) &&
      (*(longlong *)(*(longlong *)(param_3 + 2) + 8) == _DAT_181f906d8)) && (*param_3 == 0)) {
    uStack_28 = CONCAT44(uStack_28._4_4_,0x7a);
    *(undefined8 *)param_3 = uStack_28;
    param_3[2] = -0x7e06f940;
    param_3[3] = 1;
  }
  return;
}


