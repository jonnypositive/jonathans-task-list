const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  BorderStyle, WidthType, ShadingType, VerticalAlign, AlignmentType,
  ImageRun, PageBreak
} = require('docx');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method not allowed" };
  }

  try {
    const { tasks: T, recap } = JSON.parse(event.body);

    const TZ = 'America/Denver';
    const NOW = new Date();
    const DATE_STR = NOW.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:TZ});
    const TIME_STR = NOW.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:TZ});
    const DATE_TIME_STR = DATE_STR + '  \u00b7  ' + TIME_STR;

    function getDBRDate(){
      const n=new Date(),day=n.getDay(),h=n.getHours();let d=new Date(n);
      if(day===0)d.setDate(d.getDate()+1);
      else if(day===6)d.setDate(d.getDate()+2);
      else if(h>=9){d.setDate(d.getDate()+(day===5?3:1));if(d.getDay()===6)d.setDate(d.getDate()+2);if(d.getDay()===0)d.setDate(d.getDate()+1);}
      return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:TZ});
    }

    function getCultureClubDate(){
      const anchor=new Date('2026-03-18T14:30:00');
      const nowMT=new Date(NOW.toLocaleString('en-US',{timeZone:TZ}));
      let next=new Date(anchor);
      while(next<=nowMT)next.setDate(next.getDate()+14);
      return next.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:TZ}).replace(/,\s+\d{4}$/,'')+' @ 2:30 PM';
    }

    function getAffinityDate(){
      const anchor=new Date('2026-03-26T11:00:00');
      const nowMT=new Date(NOW.toLocaleString('en-US',{timeZone:TZ}));
      let next=new Date(anchor);
      while(next<=nowMT)next.setDate(next.getDate()+28);
      return next.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:TZ}).replace(/,\s+\d{4}$/,'')+' @ 11:00 AM';
    }

    function fmt(s){
      if(!s)return '';
      const p=s.split('-');if(p.length!==3)return s;
      return parseInt(p[1],10)+'/'+parseInt(p[2],10)+'/'+String(parseInt(p[0],10)).slice(-2);
    }

    // Sort proposals_out by arrival date
    if(T.proposals_out){
      T.proposals_out.sort((a,b)=>{
        if(!a.arrival&&!b.arrival)return 0;
        if(!a.arrival)return 1;
        if(!b.arrival)return -1;
        return new Date(a.arrival)-new Date(b.arrival);
      });
    }

    const FONT='Arial', W=10800, HW=5400;
    const C={hdr:'1F3864',sub:'2E5FA0',perpBg:'DDEEFF',highBg:'FFEDED',alt:'F7F7F7',white:'FFFFFF',bdr:'BBBBBB'};
    const bdr={style:BorderStyle.SINGLE,size:1,color:C.bdr};
    const B={top:bdr,bottom:bdr,left:bdr,right:bdr};
    const NB={top:{style:BorderStyle.NONE,size:0,color:'FFFFFF'},bottom:{style:BorderStyle.NONE,size:0,color:'FFFFFF'},left:{style:BorderStyle.NONE,size:0,color:'FFFFFF'},right:{style:BorderStyle.NONE,size:0,color:'FFFFFF'}};

    function pl(p){return{high:'HIGH',med:'MED',low:'LOW',none:''}[p]||'';}
    function tbg(t,ri){if(t.perpetual)return C.perpBg;if(t.priority==='high')return C.highBg;return ri%2===1?C.alt:C.white;}

    function taskContent(t,showArr,showDR){
      const ch=[];
      ch.push(new TextRun({text:'\u2610 ',font:'Segoe UI Symbol',size:17}));
      ch.push(new TextRun({text:t.text,font:FONT,size:17,bold:t.priority==='high'}));
      if(t.perpetual)ch.push(new TextRun({text:'  [\u221e]',font:FONT,size:14,bold:true,color:'1F4E79'}));
      const lbl=pl(t.priority);
      if(lbl)ch.push(new TextRun({text:'  ['+lbl+']',font:FONT,size:14,bold:true,color:t.priority==='high'?'9B1111':'8B5E00'}));
      if(showArr&&t.arrival)ch.push(new TextRun({text:'  Arr: '+fmt(t.arrival),font:FONT,size:14,color:'2E6B00',bold:true}));
      if(showDR&&(t.travelStart||t.travelEnd)){
        const r=(t.travelStart?fmt(t.travelStart):'?')+'\u2013'+(t.travelEnd?fmt(t.travelEnd):'?');
        ch.push(new TextRun({text:'  '+r,font:FONT,size:14,color:'2E6B00',bold:true}));
      }
      return [new Paragraph({children:ch})];
    }

    function mkCell(t,w,showArr,showDR,ri){
      return new TableCell({borders:B,width:{size:w,type:WidthType.DXA},shading:{fill:tbg(t,ri),type:ShadingType.CLEAR},margins:{top:48,bottom:48,left:100,right:100},children:taskContent(t,showArr,showDR)});
    }
    function emCell(w,ri){
      return new TableCell({borders:B,width:{size:w,type:WidthType.DXA},shading:{fill:ri%2===1?C.alt:C.white,type:ShadingType.CLEAR},margins:{top:48,bottom:48,left:100,right:100},children:[new Paragraph({children:[new TextRun({text:' ',font:FONT,size:17})]})]});
    }
    function hCell(title,w,span){
      return new TableCell({columnSpan:span||1,borders:B,width:{size:w,type:WidthType.DXA},shading:{fill:C.hdr,type:ShadingType.CLEAR},margins:{top:60,bottom:60,left:120,right:120},children:[new Paragraph({keepNext:true,children:[new TextRun({text:title,font:FONT,size:18,bold:true,color:'FFFFFF'})]})]});
    }
    function shCell(title,w){
      return new TableCell({borders:B,width:{size:w,type:WidthType.DXA},shading:{fill:C.sub,type:ShadingType.CLEAR},margins:{top:40,bottom:40,left:100,right:100},children:[new Paragraph({children:[new TextRun({text:title,font:FONT,size:16,bold:true,color:'FFFFFF'})]})]});
    }
    function divCell(label,color,bg,w,span){
      return new TableCell({columnSpan:span||1,borders:B,width:{size:w,type:WidthType.DXA},shading:{fill:bg,type:ShadingType.CLEAR},margins:{top:28,bottom:28,left:100,right:100},children:[new Paragraph({children:[new TextRun({text:label,font:FONT,size:13,bold:true,color,italics:true})]})]});
    }
    function divRow(label,color,bg,w,span){return new TableRow({cantSplit:true,children:[divCell(label,color,bg,w,span)]});}

    function buildSplit(title,lLabel,lTasks,rLabel,rTasks,showArr){
      const lActive=lTasks.filter(t=>!t.done&&t.text);
      const rActive=rTasks.filter(t=>!t.done&&t.text);
      if(!lActive.length&&!rActive.length)return null;
      const rows=[];
      rows.push(new TableRow({cantSplit:true,keepLines:true,children:[hCell(title,W,2)]}));
      rows.push(new TableRow({cantSplit:true,children:[shCell(lLabel,HW),shCell(rLabel,HW)]}));
      const max=Math.max(lActive.length,rActive.length,1);
      for(let i=0;i<max;i++){
        rows.push(new TableRow({children:[
          lActive[i]?mkCell(lActive[i],HW,showArr,false,i):emCell(HW,i),
          rActive[i]?mkCell(rActive[i],HW,showArr,false,i):emCell(HW,i)
        ]}));
      }
      return new Table({width:{size:W,type:WidthType.DXA},columnWidths:[HW,HW],rows});
    }

    function buildDual(lTitle,lTasks,lArr,lDR,rTitle,rTasks,rArr,rDR){
      const lActive=lTasks.filter(t=>!t.done&&t.text);
      const rActive=rTasks.filter(t=>!t.done&&t.text);
      function sideItems(tasks,sa,sd){
        const items=[];
        const perp=tasks.filter(t=>t.perpetual),high=tasks.filter(t=>!t.perpetual&&t.priority==='high'),rest=tasks.filter(t=>!t.perpetual&&t.priority!=='high');
        let ri=0;
        if(perp.length){items.push({div:true,label:'Perpetual',color:'1F4E79',bg:'E8F0FA'});perp.forEach(t=>items.push({t,ri:ri++,sa,sd}));}
        if(high.length){items.push({div:true,label:'High Priority',color:'AA0000',bg:'FFF0F0'});high.forEach(t=>items.push({t,ri:ri++,sa,sd}));}
        if((perp.length||high.length)&&rest.length)items.push({div:true,label:'Today',color:'404040',bg:'F2F2F2'});
        rest.forEach(t=>items.push({t,ri:ri++,sa,sd}));
        return items;
      }
      function bCell(item,w){
        if(!item)return emCell(w,0);
        if(item.div)return divCell(item.label,item.color,item.bg,w);
        return mkCell(item.t,w,item.sa,item.sd,item.ri);
      }
      const li=sideItems(lActive,lArr,lDR),ri2=sideItems(rActive,rArr,rDR);
      if(!li.length&&!ri2.length)return null;
      const max=Math.max(li.length,ri2.length);
      const rows=[];
      rows.push(new TableRow({cantSplit:true,children:[hCell(lTitle,HW),hCell(rTitle,HW)]}));
      for(let i=0;i<max;i++)rows.push(new TableRow({children:[bCell(li[i]||null,HW),bCell(ri2[i]||null,HW)]}));
      return new Table({width:{size:W,type:WidthType.DXA},columnWidths:[HW,HW],rows});
    }

    function buildTwoCol(title,tasks,showArr,showDR,mode){
      const active=tasks.filter(t=>!t.done&&t.text);
      if(!active.length)return null;
      const perp=active.filter(t=>t.perpetual);
      const high=active.filter(t=>!t.perpetual&&t.priority==='high');
      const rest=active.filter(t=>!t.perpetual&&t.priority!=='high');
      const sorted=mode==='travel'?active:[...perp,...high,...rest];
      const mid=Math.ceil(sorted.length/2);
      const left=sorted.slice(0,mid),right=sorted.slice(mid);

      function colCells(items,offset){
        const cells=[];
        if(mode==='travel'){
          const nowMT=new Date(NOW.toLocaleString('en-US',{timeZone:TZ}));
          const cut30=new Date(nowMT);cut30.setDate(cut30.getDate()+30);
          const cut60=new Date(nowMT);cut60.setDate(cut60.getDate()+60);
          let sh30=false,sh60=false;
          items.forEach((t,i)=>{
            const startDate=t.travelStart?new Date(t.travelStart+'T00:00:00'):null;
            const in30=startDate&&startDate<=cut30;
            const in60=startDate&&startDate>cut30&&startDate<=cut60;
            if(in30&&!sh30){cells.push(divCell('Next 30 days','9B1111','FFF0F0',HW));sh30=true;}
            if(in60&&!sh60){cells.push(divCell('Next 60 days','2E6B00','EAF3DE',HW));sh60=true;}
            cells.push(mkCell(t,HW,showArr,showDR,i+offset));
          });
        } else {
          let shPerp=false,shHigh=false,shToday=false;
          items.forEach((t,i)=>{
            const isPerp=!!t.perpetual,isHi=t.priority==='high'&&!isPerp;
            if(isPerp&&!shPerp){cells.push(divCell('Perpetual','1F4E79','E8F0FA',HW));shPerp=true;}
            if(isHi&&!shHigh){cells.push(divCell('High Priority','AA0000','FFF0F0',HW));shHigh=true;}
            if(!isPerp&&!isHi&&!shToday){cells.push(divCell('Today','404040','F2F2F2',HW));shToday=true;}
            cells.push(mkCell(t,HW,showArr,showDR,i+offset));
          });
        }
        return cells;
      }

      const lc=colCells(left,0),rc=colCells(right,mid);
      const max=Math.max(lc.length,rc.length);
      const rows=[];
      rows.push(new TableRow({cantSplit:true,keepLines:true,children:[hCell(title,W,2)]}));
      for(let i=0;i<max;i++){
        rows.push(new TableRow({cantSplit:true,keepLines:true,children:[lc[i]||emCell(HW,i),rc[i]||emCell(HW,i)]}));
      }
      return new Table({width:{size:W,type:WidthType.DXA},columnWidths:[HW,HW],rows});
    }

    function buildRecap(recapText){
      if(!recapText||!recapText.trim())return null;
      const paragraphs=recapText.split('\n').filter(p=>p.trim().length>0);
      const rows=[];
      rows.push(new TableRow({cantSplit:true,children:[hCell('Daily Recap',W)]}));
      paragraphs.forEach((para,i)=>{
        rows.push(new TableRow({children:[new TableCell({borders:B,width:{size:W,type:WidthType.DXA},shading:{fill:i%2===1?C.alt:C.white,type:ShadingType.CLEAR},margins:{top:36,bottom:36,left:120,right:120},children:[new Paragraph({spacing:{before:0,after:0},children:[new TextRun({text:para.trim(),font:FONT,size:16,color:'222222'})]})]})]}));
      });
      return new Table({width:{size:W,type:WidthType.DXA},columnWidths:[W],rows});
    }

    function buildNotes(rowCount){
      const rows=[];
      rows.push(new TableRow({cantSplit:true,children:[hCell('Notes',W)]}));
      for(let i=0;i<rowCount;i++){
        rows.push(new TableRow({height:{value:400,rule:'exact'},cantSplit:true,children:[new TableCell({borders:B,width:{size:W,type:WidthType.DXA},shading:{fill:i%2===1?C.alt:C.white,type:ShadingType.CLEAR},margins:{top:0,bottom:0,left:120,right:120},children:[new Paragraph({children:[new TextRun({text:' ',font:FONT,size:17})]})]})]}));
      }
      return new Table({width:{size:W,type:WidthType.DXA},columnWidths:[W],rows});
    }

    function sp(after){return new Paragraph({spacing:{before:0,after:after||70},children:[]});}
    function addSec(ch,tbl){if(tbl){ch.push(tbl);ch.push(sp(70));}}

    // Load logo from same directory as function
    const logoPath=path.join(__dirname,'hotel_polaris_logo_white.png');
    const logoData=fs.readFileSync(logoPath);

    const children=[];
    const TITLE_W=7600,LOGO_W=W-TITLE_W;

    children.push(new Table({
      width:{size:W,type:WidthType.DXA},columnWidths:[TITLE_W,LOGO_W],
      rows:[new TableRow({children:[
        new TableCell({borders:NB,width:{size:TITLE_W,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,shading:{fill:'1F3864',type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:160,right:80},
          children:[
            new Paragraph({children:[new TextRun({text:"Jonathan's Daily Task List",font:FONT,size:28,bold:true,color:'FFFFFF'})]}),
            new Paragraph({spacing:{before:30},children:[new TextRun({text:DATE_TIME_STR,font:FONT,size:18,color:'B8C8DC'})]})
          ]
        }),
        new TableCell({borders:NB,width:{size:LOGO_W,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,shading:{fill:'1F3864',type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:80,right:160},
          children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new ImageRun({type:'png',data:logoData,transformation:{width:180,height:45},altText:{title:'Hotel Polaris',description:'Hotel Polaris logo',name:'HotelPolarisLogo'}})]})]
        })
      ]})]
    }));
    children.push(sp(90));

    addSec(children,buildDual('Client Dates',T.calls||[],false,true,'DBR \u2014 '+getDBRDate(),T.dbr||[],true,false));
    addSec(children,buildSplit('Proposals','Prep',T.proposals_prep||[],'Out',T.proposals_out||[],true));
    addSec(children,buildSplit('Contracts','Prep',T.contracts_prep||[],'Out',T.contracts_out||[],true));
    addSec(children,buildTwoCol('Tasks',T.tasks||[],false,false));

    // Page break before Prospecting
    children.push(new Paragraph({children:[new PageBreak()],spacing:{before:0,after:0}}));

    addSec(children,buildTwoCol('Prospecting',T.prospecting||[],false,false));
    addSec(children,buildDual('Culture Club \u2014 '+getCultureClubDate(),T.culture||[],false,false,'Sales Manager Affinity \u2014 '+getAffinityDate(),T.affinity||[],false,false));
    addSec(children,buildTwoCol('Travel',T.travel||[],false,true,'travel'));
    addSec(children,buildRecap(recap));
    addSec(children,buildNotes(4));

    if(children.length&&children[children.length-1]instanceof Paragraph)children.pop();

    const doc=new Document({
      styles:{default:{document:{run:{font:FONT,size:17}}}},
      sections:[{
        properties:{page:{size:{width:12240,height:15840},margin:{top:720,right:720,bottom:720,left:720}}},
        children
      }]
    });

    const buffer=await Packer.toBuffer(doc);
    const base64=buffer.toString('base64');

    return {
      statusCode:200,
      headers:{
        ...headers,
        'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition':'attachment; filename="jonathans_task_list.docx"',
      },
      body:base64,
      isBase64Encoded:true,
    };

  } catch(err){
    console.error('Export error:',err.message,err.stack);
    return {
      statusCode:500,
      headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify({error:err.message}),
    };
  }
};
